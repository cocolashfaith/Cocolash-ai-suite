/**
 * lib/chat/handoff.ts — how Coco's conversations reach a human (2026-10-26).
 *
 * Before this, a lead typed mid-conversation was saved but never emailed
 * (only the unused /api/chat/lead endpoint called sendLeadEmail), and Coco's
 * "flag the conversation for review" instruction had no implementation — while
 * Coco told customers "Faith's team will reach out". Now:
 *
 *   1. LEAD    — the first time a given email appears in a session, the lead is
 *                saved AND emailed to the support inbox.
 *   2. HANDOFF — when Coco hands the customer to the team, the session is
 *                flagged "Needs follow-up" on the admin Transcripts page and the
 *                exchange is emailed to the support inbox.
 *
 * DETECTION is explicit: the locked voice rules tell Coco to end any hand-off
 * reply with HANDOFF_MARKER, which the chat route strips from the stream
 * (createHandoffFilter) before the shopper sees it. The only fallback is Coco
 * reciting the escalation / don't-know line the admin configured — no
 * free-text phrase matching, so a reply that merely mentions the team can't
 * trigger an email.
 *
 * DELIVERY is tracked in existing text columns (no schema change), so a failed
 * send is retried instead of suppressed, and concurrent requests never both
 * send. Every notification moves through
 *
 *     unsent ──claim──▶ sending <key>:<claim> until <expiry> ──▶ delivered
 *        ▲                          │ send failed / lease expired
 *        └──────────────────────────┘
 *
 * A claim is a conditional UPDATE from the exact value we read to a value
 * carrying a fresh claim nonce, so exactly one concurrent request wins (the
 * losers' WHERE no longer matches). Completion is conditional on that value
 * too. A crashed sender's lease expires and the next trigger retries; a send
 * is bounded well inside the lease (MAX_RESEND_MS), so a live sender is never
 * overtaken.
 *
 * The Resend Idempotency-Key is the notification's identity, kept separate from
 * the claim: `<key>` survives an expired lease and an unconfirmed send (timeout,
 * 5xx, 409 — Resend may have accepted it), and the email content is frozen with
 * it, so a retry is the identical request and Resend deduplicates it. Only a
 * send Resend definitely did not make (a 4xx rejection, no API key) gets a fresh
 * key — and only if that same attempt minted it: once any send under a key is
 * unconfirmed, the key (with its mint time and frozen content) is kept through
 * every later failure, rejected or skipped alike. Resend forgets keys after 24
 * hours, so a key carries its mint time and an unconfirmed notification is
 * never re-sent once it is older than DEDUPE_WINDOW_MS — it stays flagged in
 * the admin for the team instead.
 *
 *   - leads:    lead_captures.notes   "<base>" | "<base> · retry <key>"
 *                 | "<base> · sending <key>:<claim> until <ms>"
 *                 | "<base> · emailed to support"
 *   - handoffs: chat_sessions.intent_summary
 *                 null | "Needs follow-up (email pending[, retry <key>][, contact <email>]): <reason>"
 *                 | "Needs follow-up (sending <key>:<claim> until <ms>[, contact <email>]): <reason>"
 *                 | "Needs follow-up: <reason>"
 *
 * The route runs these with runAfterResponse() — nothing here sits on the
 * response-critical path, and a failure is logged, never shown to the shopper.
 */

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { sendHandoffEmail, sendLeadEmail, type NotifyResult } from "./notify";
import type { VoiceFragments } from "./types";

/** Hidden marker Coco appends to a hand-off reply (see lib/chat/voice-rules.ts). */
export const HANDOFF_MARKER = "[[HANDOFF]]";

/**
 * How long a sender holds a claim before another trigger may retry. Several
 * times the longest a send can take (MAX_RESEND_MS), so a lease only ever
 * expires on a sender that died.
 */
export const CLAIM_LEASE_MS = 2 * 60 * 1000;

/** Resend keeps idempotency keys for 24 hours; retries stay safely inside that. */
export const DEDUPE_WINDOW_MS = 23 * 60 * 60 * 1000;

const FLAG = "Needs follow-up";
/** intent_summary prefix once the team has been emailed. */
export const FOLLOW_UP_PREFIX = `${FLAG}: `;
/** intent_summary prefix while the handoff email is not delivered yet. */
export const FOLLOW_UP_PENDING_PREFIX = `${FLAG} (email pending): `;
/** lead_captures.notes suffix once the lead email is delivered. */
export const EMAILED_MARK = " · emailed to support";

const LEAD_BASE_NOTE = "captured from chat message";
const DEFAULT_APP_URL = "https://cocolash-ai-suite.vercel.app";
const FROM_NAME = "CocoLash AI";

export function supportInbox(): string {
  return process.env.CHATBOT_SUPPORT_EMAIL || "support@cocolash.com";
}

export function leadFromAddress(): string {
  return process.env.LEAD_EMAIL_FROM || "leads@cocolash.com";
}

/**
 * Deep link to one conversation in the admin. The Transcripts page reads the
 * session from `?session=` — the old `/transcripts/<id>` path never existed,
 * so the link in the original lead email would have 404'd.
 */
export function transcriptUrl(sessionId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(
    /\/+$/,
    ""
  );
  return `${base}/chatbot/admin/transcripts?session=${encodeURIComponent(sessionId)}`;
}

/** First email address in a message, lower-cased, or null. */
export function extractEmail(message: string): string | null {
  const match = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase().replace(/[.]+$/, "") : null;
}

// ── Follow-up flag (chat_sessions.intent_summary) ─────────────

export interface FollowUpState {
  state: "none" | "pending" | "sending" | "delivered";
  reason: string;
  /** Idempotency key a retry must reuse (an unconfirmed or in-flight send). */
  key?: string;
  /** Nonce of the current claim (sending only). */
  claim?: string;
  expiresAt?: number;
  /** Customer email frozen into the email `key` identifies (only with a key). */
  contact?: string;
}

const FOLLOW_UP_RE = /^Needs follow-up(?: \(([^)]*)\))?: ([\s\S]*)$/;
const RETRY_PART = /^retry ([\w-]+)$/;
const SENDING_PART = /^sending ([\w-]+):([\w-]+) until (\d+)$/;
const CONTACT_PART = /^contact (\S+)$/;

export function parseFollowUp(summary: string | null | undefined): FollowUpState {
  const m = summary ? FOLLOW_UP_RE.exec(summary) : null;
  if (!m) return { state: "none", reason: "" };
  const reason = m[2];
  if (m[1] === undefined) return { state: "delivered", reason };
  const parsed: FollowUpState = { state: "pending", reason };
  for (const part of m[1].split(", ")) {
    const retry = RETRY_PART.exec(part);
    const sending = SENDING_PART.exec(part);
    const contact = CONTACT_PART.exec(part);
    if (retry) parsed.key = retry[1];
    if (sending) {
      parsed.state = "sending";
      parsed.key = sending[1];
      parsed.claim = sending[2];
      parsed.expiresAt = Number(sending[3]);
    }
    if (contact) parsed.contact = contact[1];
  }
  return parsed;
}

export function isFlaggedForFollowUp(summary: string | null | undefined): boolean {
  return parseFollowUp(summary).state !== "none";
}

/** The customer's words that triggered the handoff, without the storage prefix. */
export function followUpReason(summary: string | null | undefined): string | null {
  const parsed = parseFollowUp(summary);
  return parsed.state === "none" ? null : parsed.reason;
}

export function followUpReasonText(customerMessage: string): string {
  const reason = squash(customerMessage);
  return reason.length > 200 ? `${reason.slice(0, 197)}…` : reason;
}

function followUpSummary(
  status: string,
  reason: string,
  contact: string | null | undefined
): string {
  const parts = contact ? [status, `contact ${contact}`] : [status];
  return `${FLAG} (${parts.join(", ")}): ${reason}`;
}

// ── Lead delivery state (lead_captures.notes) ─────────────────

interface LeadNoteState {
  base: string;
  state: "unsent" | "sending" | "emailed";
  /** Idempotency key a retry must reuse (an unconfirmed or in-flight send). */
  key?: string;
  expiresAt?: number;
}

const LEAD_STATE_RE = / · (?:retry ([\w-]+)|sending ([\w-]+):[\w-]+ until (\d+))$/;

export function parseLeadNotes(notes: string | null | undefined): LeadNoteState {
  const n = notes ?? "";
  if (n.endsWith(EMAILED_MARK)) {
    return { base: n.slice(0, -EMAILED_MARK.length), state: "emailed" };
  }
  const m = LEAD_STATE_RE.exec(n);
  if (m?.[1]) return { base: n.slice(0, m.index), state: "unsent", key: m[1] };
  if (m) {
    return { base: n.slice(0, m.index), state: "sending", key: m[2], expiresAt: Number(m[3]) };
  }
  return { base: n || LEAD_BASE_NOTE, state: "unsent" };
}

/** A fresh notification identity, stamped with when it was minted. */
function newKey(now: number): string {
  return `${now}-${randomUUID()}`;
}

/**
 * Whether Resend still deduplicates `key` (see DEDUPE_WINDOW_MS). A key without
 * a readable mint time is treated as expired — never re-sent automatically.
 */
export function keyStillDeduplicated(key: string, now: number): boolean {
  const minted = /^(?:h-)?(\d+)-/.exec(key);
  return minted !== null && now - Number(minted[1]) < DEDUPE_WINDOW_MS;
}

function newClaim(): string {
  return randomUUID().slice(0, 8);
}

// ── Detection ─────────────────────────────────────────────────

/**
 * Strips HANDOFF_MARKER out of a token stream before it reaches the shopper.
 * The marker can arrive split across deltas, so any tail that could still
 * become a marker is held back until the next delta (or flush) decides. That
 * includes nested openings ("[[HAND[[HAN"): removing an inner marker can join
 * the pieces around it, so a tail made entirely of marker openings is held as
 * a whole. Removal repeats until no marker remains, and an unfinished marker
 * left at end-of-stream — e.g. a reply cut off by the token limit — is dropped
 * rather than shown.
 */
export interface HandoffFilter {
  push(delta: string): string;
  flush(): string;
  readonly found: boolean;
}

/**
 * Index where the longest suffix of `text` made only of non-empty proper
 * prefixes of `marker` begins (text.length when there is none). Only such a
 * suffix can still turn into a marker once more text arrives.
 */
function markerTailStart(text: string, marker: string): number {
  const holdable = new Array<boolean>(text.length + 1).fill(false);
  holdable[text.length] = true;
  let start = text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    for (let k = 1; k < marker.length && i + k <= text.length; k++) {
      if (text[i + k - 1] !== marker[k - 1]) break;
      if (holdable[i + k]) {
        holdable[i] = true;
        start = i;
        break;
      }
    }
  }
  return start;
}

export function createHandoffFilter(marker: string = HANDOFF_MARKER): HandoffFilter {
  let buffer = "";
  let found = false;
  const strip = () => {
    while (buffer.includes(marker)) {
      found = true;
      buffer = buffer.split(marker).join("");
    }
  };
  return {
    push(delta: string): string {
      buffer += delta;
      strip();
      const hold = markerTailStart(buffer, marker);
      const out = buffer.slice(0, hold);
      buffer = buffer.slice(hold);
      return out;
    },
    flush(): string {
      strip();
      // What's held is made only of marker openings. 3+ chars ("[[H…") can
      // only be a truncated marker; a lone "[" or "[[" is ordinary text.
      const out = buffer.length >= 3 ? "" : buffer;
      buffer = "";
      return out;
    },
    get found() {
      return found;
    },
  };
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalize(s: string): string {
  return squash(s.toLowerCase().replace(/[*_`]/g, "").replace(/[’‘]/g, "'"));
}

/** The opening of a voice fragment — enough to recognise it when Coco recites it. */
function signature(fragment: string | undefined): string | null {
  if (!fragment) return null;
  const n = normalize(fragment);
  return n.length >= 24 ? n.slice(0, 40) : null;
}

/**
 * Did Coco hand the customer to a human in this reply? Primary signal: she
 * emitted HANDOFF_MARKER. Fallback: she recited the escalation / don't-know
 * line the admin configured for exactly this moment. Free-text phrases ("the
 * team will contact you") are deliberately not matched — negation and clause
 * scope can't be judged reliably from a phrase list.
 */
export function detectHandoff(input: {
  assistantText: string;
  markerFound: boolean;
  fragments: Partial<Pick<VoiceFragments, "escalation" | "dont_know">>;
}): boolean {
  if (input.markerFound) return true;
  const text = normalize(input.assistantText);
  if (!text) return false;
  return [input.fragments.escalation, input.fragments.dont_know].some((fragment) => {
    const sig = signature(fragment);
    return sig !== null && text.includes(sig);
  });
}

// ── Scheduling ────────────────────────────────────────────────

/**
 * Run work after the response has been sent (Next.js `after()`, kept alive via
 * waitUntil), so notifications never delay or stall Coco's reply. Outside a
 * request scope — tests, scripts — `after` throws and the task runs
 * immediately; in production that would lose the lifecycle guarantee, so it
 * is logged loudly.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const safe = () =>
    task().catch((err) => {
      log.warn("chat.handoff_task_failed", {
        task: label,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  try {
    after(safe);
  } catch (err) {
    if (process.env.NODE_ENV === "production" && !process.env.VITEST) {
      log.warn("chat.after_unavailable", {
        task: label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    void safe();
  }
}

/** Only a confirmed Resend send counts as delivered (dry-run / no key do not). */
function delivered(result: NotifyResult): boolean {
  return result.ok && result.via === "resend";
}

/**
 * Whether a failed attempt may drop its key, so the next attempt mints a fresh
 * one (and a rejection Resend stored under the old key can't be replayed).
 * Only when this attempt minted the key AND certainly put nothing on the wire —
 * a 4xx rejection, or no real send at all. A reused key stands for an earlier
 * unconfirmed send that a later rejection or skip says nothing about, so it is
 * kept until delivery or DEDUPE_WINDOW_MS.
 */
function canDropKey(mintedNow: boolean, result: NotifyResult): boolean {
  return mintedNow && (result.via !== "resend" || result.rejected === true);
}

// ── 1. Leads ──────────────────────────────────────────────────

export type LeadOutcome =
  | "emailed"
  | "already_emailed"
  | "in_flight"
  | "lost_claim"
  | "send_failed"
  | "unconfirmed"
  | "duplicate_race"
  | "save_failed";

/** Lead keys starting with this were minted for the "handed off" variant. */
const HANDED_OFF_KEY = "h-";

/**
 * Save a lead typed mid-conversation and email the support inbox. Idempotent
 * per session + email: once delivered it never re-sends; if a send failed (or a
 * sender died mid-lease), the next mention of the same address retries it.
 */
export async function captureLeadFromChat(
  supabase: SupabaseClient,
  input: { sessionId: string; email: string },
  now: number = Date.now()
): Promise<LeadOutcome> {
  const { data: existing } = await supabase
    .from("lead_captures")
    .select("id, notes")
    .eq("session_id", input.sessionId)
    .eq("email", input.email)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const rows = (existing ?? []) as Array<{ id: string; notes: string | null }>;

  if (rows.some((r) => parseLeadNotes(r.notes).state === "emailed")) return "already_emailed";

  let lead = rows[0];
  if (!lead) {
    const { data: inserted, error } = await supabase
      .from("lead_captures")
      .insert({
        session_id: input.sessionId,
        email: input.email,
        consent: true,
        intent_at_capture: null,
        discount_offered: null,
        notes: LEAD_BASE_NOTE,
      })
      .select("id, notes")
      .single();
    if (error || !inserted) {
      log.warn("chat.lead_capture_failed", {
        sessionId: input.sessionId,
        error: error?.message ?? "no row returned",
      });
      return "save_failed";
    }
    lead = inserted as { id: string; notes: string | null };

    // Earliest-row-wins: if a concurrent request saved the same address first,
    // drop our duplicate and leave the notification to that row's claimant.
    const { data: all } = await supabase
      .from("lead_captures")
      .select("id")
      .eq("session_id", input.sessionId)
      .eq("email", input.email)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const first = (all as Array<{ id: string }> | null)?.[0];
    if (first && first.id !== lead.id) {
      await supabase.from("lead_captures").delete().eq("id", lead.id);
      return "duplicate_race";
    }
    log.info("chat.lead_captured", { sessionId: input.sessionId, email: input.email });
  }

  const note = parseLeadNotes(lead.notes);
  if (note.state === "sending" && (note.expiresAt ?? 0) > now) return "in_flight";
  if (note.key && !keyStillDeduplicated(note.key, now)) {
    log.warn("chat.lead_email_unconfirmed", { sessionId: input.sessionId, leadId: lead.id });
    return "unconfirmed";
  }

  // A retry reuses the key (and with it the email's content: everything else
  // in the payload is fixed per lead); a first attempt mints one, recording in
  // it whether Coco had already handed this customer off.
  let key = note.key;
  const mintedNow = !key;
  if (!key) {
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("intent_summary")
      .eq("id", input.sessionId)
      .maybeSingle();
    const handedOff = isFlaggedForFollowUp(
      (session as { intent_summary?: string | null } | null)?.intent_summary
    );
    key = `${handedOff ? HANDED_OFF_KEY : ""}${newKey(now)}`;
  }

  // Claim: move the row from the exact notes we read to a claim-bearing value.
  const claimedNotes = `${note.base} · sending ${key}:${newClaim()} until ${now + CLAIM_LEASE_MS}`;
  let claim = supabase
    .from("lead_captures")
    .update({ notes: claimedNotes })
    .eq("id", lead.id);
  claim = lead.notes === null ? claim.is("notes", null) : claim.eq("notes", lead.notes);
  const { data: claimed } = await claim.select("id");
  if (!claimed || claimed.length === 0) return "lost_claim";

  const result = await sendLeadEmail({
    to: supportInbox(),
    fromName: FROM_NAME,
    fromEmail: leadFromAddress(),
    email: input.email,
    intent: null,
    discountOffered: null,
    transcriptLink: transcriptUrl(input.sessionId),
    notes: key.startsWith(HANDED_OFF_KEY)
      ? "This customer was handed off to the team by Coco. Please follow up."
      : "Shared mid-conversation with Coco.",
    idempotencyKey: `lead:${lead.id}:${key}`,
  });
  log.info("chat.lead_email", {
    sessionId: input.sessionId,
    ok: result.ok,
    via: result.via,
    error: result.error,
  });

  const sent = delivered(result);
  const next = sent
    ? `${note.base}${EMAILED_MARK}`
    : canDropKey(mintedNow, result)
      ? note.base
      : `${note.base} · retry ${key}`;
  await supabase
    .from("lead_captures")
    .update({ notes: next })
    .eq("id", lead.id)
    .eq("notes", claimedNotes);
  return sent ? "emailed" : "send_failed";
}

// ── 2. Handoffs ───────────────────────────────────────────────

export type HandoffOutcome =
  | "emailed"
  | "already_emailed"
  | "in_flight"
  | "lost_claim"
  | "send_failed"
  | "unconfirmed";

/**
 * Flag the session "Needs follow-up" and email the support inbox. Claimed with
 * a conditional update (one winner), marked delivered only after Resend
 * confirms, and otherwise retried on the session's next handoff. The email is
 * built only from what the flag stores (reason + frozen contact), so a retry
 * under the same key sends exactly the same request.
 */
export async function flagHandoff(
  supabase: SupabaseClient,
  input: { sessionId: string; customerMessage: string },
  now: number = Date.now()
): Promise<HandoffOutcome> {
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("intent_summary")
    .eq("id", input.sessionId)
    .maybeSingle();
  const current =
    (session as { intent_summary?: string | null } | null)?.intent_summary ?? null;
  const flag = parseFollowUp(current);
  if (flag.state === "delivered") return "already_emailed";
  if (flag.state === "sending" && (flag.expiresAt ?? 0) > now) return "in_flight";
  if (flag.key && !keyStillDeduplicated(flag.key, now)) {
    log.warn("chat.handoff_email_unconfirmed", { sessionId: input.sessionId });
    return "unconfirmed";
  }

  // Keep the original reason on a retry; otherwise record this message.
  const reason = flag.state === "none" ? followUpReasonText(input.customerMessage) : flag.reason;
  let key = flag.key;
  let contact = flag.contact ?? null;
  const mintedNow = !key;
  if (!key) {
    key = newKey(now);
    const found =
      extractEmail(input.customerMessage) ?? (await latestLeadEmail(supabase, input.sessionId));
    // Frozen into the flag text, so it must not contain the separators.
    contact = found && /^[^\s,()]+$/.test(found) ? found : null;
  }
  const sendingValue = followUpSummary(
    `sending ${key}:${newClaim()} until ${now + CLAIM_LEASE_MS}`,
    reason,
    contact
  );

  let claim = supabase
    .from("chat_sessions")
    .update({ intent_summary: sendingValue })
    .eq("id", input.sessionId);
  claim = current === null ? claim.is("intent_summary", null) : claim.eq("intent_summary", current);
  const { data: claimed, error } = await claim.select("id");
  if (error || !claimed || claimed.length === 0) {
    if (error) {
      log.warn("chat.handoff_flag_failed", { sessionId: input.sessionId, error: error.message });
    }
    return "lost_claim";
  }
  log.info("chat.handoff_flagged", { sessionId: input.sessionId });

  const result = await sendHandoffEmail({
    to: supportInbox(),
    fromName: FROM_NAME,
    fromEmail: leadFromAddress(),
    customerMessage: reason,
    customerEmail: contact,
    transcriptLink: transcriptUrl(input.sessionId),
    idempotencyKey: `handoff:${input.sessionId}:${key}`,
  });
  log.info("chat.handoff_email", {
    sessionId: input.sessionId,
    ok: result.ok,
    via: result.via,
    error: result.error,
  });

  const sent = delivered(result);
  const next = sent
    ? `${FOLLOW_UP_PREFIX}${reason}`
    : canDropKey(mintedNow, result)
      ? `${FOLLOW_UP_PENDING_PREFIX}${reason}`
      : followUpSummary(`email pending, retry ${key}`, reason, contact);
  await supabase
    .from("chat_sessions")
    .update({ intent_summary: next })
    .eq("id", input.sessionId)
    .eq("intent_summary", sendingValue);
  return sent ? "emailed" : "send_failed";
}

async function latestLeadEmail(supabase: SupabaseClient, sessionId: string): Promise<string | null> {
  const { data: lead } = await supabase
    .from("lead_captures")
    .select("email")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);
  return (lead?.[0] as { email?: string } | undefined)?.email ?? null;
}
