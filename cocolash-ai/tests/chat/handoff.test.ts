/**
 * Coco → human handoff (2026-10-26, Faith's report: "Coco tells customers
 * support will reach out, but no email ever gets sent"), including the fixes
 * from the Codex review: delivery-tracked retries, explicit hand-off marker,
 * atomic claims, cookie-free admin writes, and nothing on the response path.
 *
 * lib/chat/handoff.ts runs against a small in-memory PostgREST fake so the
 * state transitions (pending → delivered, retries, races) are really exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/chat/notify", async (orig) => {
  const actual = await orig<typeof import("@/lib/chat/notify")>();
  return {
    ...actual,
    sendLeadEmail: vi.fn(),
    sendHandoffEmail: vi.fn(),
  };
});

import * as notify from "@/lib/chat/notify";
import {
  EMAILED_MARK,
  FOLLOW_UP_PENDING_PREFIX,
  FOLLOW_UP_PREFIX,
  HANDOFF_MARKER,
  captureLeadFromChat,
  createHandoffFilter,
  detectHandoff,
  extractEmail,
  CLAIM_LEASE_MS,
  DEDUPE_WINDOW_MS,
  flagHandoff,
  keyStillDeduplicated,
  followUpReason,
  parseFollowUp,
  parseLeadNotes,
  isFlaggedForFollowUp,
  supportInbox,
  transcriptUrl,
} from "@/lib/chat/handoff";
import { assertRowsUpdated, auditUserId } from "@/lib/chat/admin-write";
import { DEFAULT_VOICE_FRAGMENTS } from "@/lib/chat/voice";

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const SENT = { ok: true, via: "resend" } as const;
/** Resend refused it (nothing was sent): the next attempt may use a fresh key. */
const FAILED = { ok: false, via: "resend", error: "Resend 401: invalid key", rejected: true } as const;
/** Timed out / 5xx: Resend may have accepted it, so a retry must reuse the key. */
const UNCONFIRMED = { ok: false, via: "resend", error: "The operation was aborted due to timeout" } as const;
const NO_KEY = { ok: true, via: "skipped" } as const;

const leadKey = (n: number) => vi.mocked(notify.sendLeadEmail).mock.calls[n][0].idempotencyKey;
const handoffKey = (n: number) => vi.mocked(notify.sendHandoffEmail).mock.calls[n][0].idempotencyKey;

// ── In-memory PostgREST fake ──────────────────────────────────

type Row = Record<string, unknown>;
interface Db {
  lead_captures: Row[];
  chat_sessions: Row[];
}
interface Hooks {
  failInsert?: boolean;
  /** Runs once, right before the first insert executes (race simulation). */
  beforeInsert?: (db: Db, now: () => string) => void;
  /** Runs once, right before the first update executes (race simulation). */
  beforeUpdate?: (db: Db) => void;
}

function fakeSupabase(db: Db, hooks: Hooks = {}) {
  let seq = 0;
  const now = () => new Date(Date.UTC(2026, 9, 26, 0, 0, seq++)).toISOString();
  let insertHookRan = false;
  let updateHookRan = false;

  function from(table: keyof Db) {
    const q = {
      op: undefined as undefined | "select" | "insert" | "update" | "delete",
      payload: {} as Row,
      filters: [] as Array<(r: Row) => boolean>,
      order: [] as Array<[string, boolean]>,
      limit: Infinity,
      wantRows: false,
      mode: "many" as "many" | "single" | "maybe",
    };
    const shape = (list: Row[]) => {
      if (q.mode === "single") {
        return { data: list[0] ?? null, error: list[0] ? null : { message: "no rows" } };
      }
      if (q.mode === "maybe") return { data: list[0] ?? null, error: null };
      return { data: list, error: null };
    };
    const exec = () => {
      if (q.op === "insert") {
        if (hooks.failInsert) return { data: null, error: { message: "db down" } };
        if (hooks.beforeInsert && !insertHookRan) {
          insertHookRan = true;
          hooks.beforeInsert(db, now);
        }
        const row = { id: `${table}-${String(seq).padStart(3, "0")}`, created_at: now(), ...q.payload };
        db[table].push(row);
        return shape([row]);
      }
      if (q.op === "update" && hooks.beforeUpdate && !updateHookRan) {
        updateHookRan = true;
        hooks.beforeUpdate(db);
      }
      const matched = db[table].filter((r) => q.filters.every((f) => f(r)));
      if (q.op === "update") {
        matched.forEach((r) => Object.assign(r, q.payload));
        return q.wantRows ? shape(matched) : { data: null, error: null };
      }
      if (q.op === "delete") {
        db[table] = db[table].filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      let out = [...matched];
      for (const [col, asc] of [...q.order].reverse()) {
        out.sort((a, b) => {
          const x = String(a[col]);
          const y = String(b[col]);
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      out = out.slice(0, q.limit);
      return shape(out);
    };
    const b: Record<string, unknown> = {
      select: () => {
        if (q.op === undefined) q.op = "select";
        else q.wantRows = true;
        return b;
      },
      insert: (row: Row) => {
        q.op = "insert";
        q.payload = row;
        return b;
      },
      update: (patch: Row) => {
        q.op = "update";
        q.payload = patch;
        return b;
      },
      delete: () => {
        q.op = "delete";
        return b;
      },
      eq: (c: string, v: unknown) => {
        q.filters.push((r) => r[c] === v);
        return b;
      },
      is: (c: string, v: unknown) => {
        q.filters.push((r) => (r[c] ?? null) === v);
        return b;
      },
      order: (c: string, o?: { ascending?: boolean }) => {
        q.order.push([c, o?.ascending !== false]);
        return b;
      },
      limit: (n: number) => {
        q.limit = n;
        return b;
      },
      single: () => {
        q.mode = "single";
        return b;
      },
      maybeSingle: () => {
        q.mode = "maybe";
        return b;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  return { from } as never;
}

function freshDb(intentSummary: string | null = null, leads: Row[] = []): Db {
  return {
    chat_sessions: [{ id: "s1", intent_summary: intentSummary }],
    lead_captures: leads,
  };
}

beforeEach(() => {
  vi.mocked(notify.sendLeadEmail).mockReset().mockResolvedValue(SENT);
  vi.mocked(notify.sendHandoffEmail).mockReset().mockResolvedValue(SENT);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── Links & helpers ───────────────────────────────────────────

describe("transcriptUrl", () => {
  it("links to the ?session= view the Transcripts page actually reads", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cocolash-ai-suite.vercel.app/");
    expect(transcriptUrl("abc-123")).toBe(
      "https://cocolash-ai-suite.vercel.app/chatbot/admin/transcripts?session=abc-123"
    );
  });

  it("falls back to the production URL when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(transcriptUrl("s1")).toBe(
      "https://cocolash-ai-suite.vercel.app/chatbot/admin/transcripts?session=s1"
    );
  });

  it("no route still builds the old /transcripts/<id> path that 404'd", () => {
    for (const file of ["app/api/chat/lead/route.ts", "lib/chat/handoff.ts"]) {
      expect(src(file)).not.toMatch(/transcripts\/\$\{/);
    }
  });
});

describe("supportInbox / extractEmail / flag helpers", () => {
  it("defaults to support@cocolash.com and honours CHATBOT_SUPPORT_EMAIL", () => {
    vi.stubEnv("CHATBOT_SUPPORT_EMAIL", "");
    expect(supportInbox()).toBe("support@cocolash.com");
    vi.stubEnv("CHATBOT_SUPPORT_EMAIL", "team@cocolash.com");
    expect(supportInbox()).toBe("team@cocolash.com");
  });

  it("extracts a lower-cased address and drops a trailing full stop", () => {
    expect(extractEmail("sure, it's Jane.Doe@Gmail.com thanks")).toBe("jane.doe@gmail.com");
    expect(extractEmail("email me at jane@site.co.")).toBe("jane@site.co");
    expect(extractEmail("no email here")).toBeNull();
  });

  it("recognises both flag states and recovers the reason", () => {
    expect(isFlaggedForFollowUp(`${FOLLOW_UP_PREFIX}refund`)).toBe(true);
    expect(isFlaggedForFollowUp(`${FOLLOW_UP_PENDING_PREFIX}refund`)).toBe(true);
    expect(isFlaggedForFollowUp(null)).toBe(false);
    expect(followUpReason(`${FOLLOW_UP_PENDING_PREFIX}refund please`)).toBe("refund please");
    expect(followUpReason(`${FOLLOW_UP_PREFIX}refund please`)).toBe("refund please");
    expect(followUpReason("other summary")).toBeNull();
  });
});

describe("delivery state parsing", () => {
  it("parses every follow-up state, including the key and frozen contact", () => {
    expect(parseFollowUp(null).state).toBe("none");
    expect(parseFollowUp("Needs follow-up: refund")).toMatchObject({ state: "delivered", reason: "refund" });
    expect(parseFollowUp("Needs follow-up (email pending): refund")).toMatchObject({ state: "pending", reason: "refund" });
    expect(parseFollowUp("Needs follow-up (email pending): refund").key).toBeUndefined();
    expect(
      parseFollowUp("Needs follow-up (email pending, retry k-1, contact jane@x.com): refund")
    ).toMatchObject({ state: "pending", reason: "refund", key: "k-1", contact: "jane@x.com" });
    expect(
      parseFollowUp("Needs follow-up (sending k-1:c1 until 12345, contact jane@x.com): refund")
    ).toMatchObject({
      state: "sending",
      reason: "refund",
      key: "k-1",
      claim: "c1",
      expiresAt: 12345,
      contact: "jane@x.com",
    });
  });

  it("keeps a reason that itself contains brackets or colons", () => {
    expect(parseFollowUp("Needs follow-up: (urgent): refund")).toMatchObject({
      state: "delivered",
      reason: "(urgent): refund",
    });
    expect(parseFollowUp("Needs follow-up (email pending): a): b").reason).toBe("a): b");
  });

  it("parses lead notes states and keeps the base note", () => {
    expect(parseLeadNotes("captured from chat message")).toMatchObject({ state: "unsent" });
    expect(parseLeadNotes(`captured from chat message${EMAILED_MARK}`)).toMatchObject({
      state: "emailed",
      base: "captured from chat message",
    });
    expect(parseLeadNotes("captured from chat message · sending k-1:c1 until 99")).toMatchObject({
      state: "sending",
      base: "captured from chat message",
      key: "k-1",
      expiresAt: 99,
    });
    expect(parseLeadNotes("captured from chat message · retry k-1")).toMatchObject({
      state: "unsent",
      base: "captured from chat message",
      key: "k-1",
    });
  });
});

// ── The hidden marker ─────────────────────────────────────────

describe("createHandoffFilter", () => {
  const run = (deltas: string[]) => {
    const f = createHandoffFilter();
    const out = deltas.map((d) => f.push(d)).join("") + f.flush();
    return { out, found: f.found };
  };

  it("strips the marker and records it", () => {
    const r = run(["Please email support@cocolash.com.\n", HANDOFF_MARKER]);
    expect(r.out).toBe("Please email support@cocolash.com.\n");
    expect(r.found).toBe(true);
  });

  it("strips a marker split across deltas", () => {
    const r = run(["The team will follow up. [[HAN", "DOF", "F]]"]);
    expect(r.out).not.toContain("[[");
    expect(r.out).not.toContain("HANDOFF");
    expect(r.found).toBe(true);
  });

  it("releases a lookalike that turns out not to be the marker", () => {
    const r = run(["Use code [[", "VIP]] at checkout"]);
    expect(r.out).toBe("Use code [[VIP]] at checkout");
    expect(r.found).toBe(false);
  });

  it("drops an unfinished marker cut off at end-of-stream (Codex LOW)", () => {
    const r = run(["hello [[HAN"]);
    expect(r.out).toBe("hello ");
  });

  it("keeps a genuine trailing '[[' that can't be a marker yet", () => {
    expect(run(["see [["]).out).toBe("see [[");
  });

  it("can't be fooled into rebuilding the marker from nested pieces (Codex LOW)", () => {
    const r = run(["[[HAND[[HANDOFF]]OFF]] done"]);
    expect(r.out).not.toContain(HANDOFF_MARKER);
    expect(r.out).toBe(" done");
    expect(r.found).toBe(true);
  });

  it("holds nested openings across deltas until removal settles (Codex LOW)", () => {
    const r = run(["[[HAND[[HAN", "DOFF]]OFF]]"]);
    expect(r.out).toBe("");
    expect(r.found).toBe(true);
  });

  it("strips nested markers at every possible chunk boundary", () => {
    const text = "Hi [[HAND[[HANDOFF]]OFF]] there [[H[[HAND[[HANDOFF]]OFF]]ANDOFF]]!";
    for (let i = 0; i <= text.length; i++) {
      for (let j = i; j <= text.length; j += 3) {
        const r = run([text.slice(0, i), text.slice(i, j), text.slice(j)]);
        expect(r.out, `split at ${i}/${j}`).toBe("Hi  there !");
      }
    }
  });

  it("releases bracket text that can't become a marker", () => {
    expect(run(["a [[b", "]] [c] d[["]).out).toBe("a [[b]] [c] d[[");
    expect(run(["x[", "[", "VIP]]"]).out).toBe("x[[VIP]]");
  });

  it("passes ordinary text through untouched", () => {
    const r = run(["Dahlia is ", "our most natural set."]);
    expect(r.out).toBe("Dahlia is our most natural set.");
    expect(r.found).toBe(false);
  });

  it("is what the chat route streams through", () => {
    const route = src("app/api/chat/route.ts");
    expect(route).toContain("createHandoffFilter()");
    expect(route).toContain("handoffFilter.push(delta)");
    expect(route).toContain("handoffFilter.flush()");
  });

  it("Coco is told to emit it on every hand-off", () => {
    expect(src("lib/chat/voice-rules.ts")).toContain(
      "end your reply with the\nmarker [[HANDOFF]]"
    );
  });
});

// ── Detection ─────────────────────────────────────────────────

describe("detectHandoff", () => {
  const base = { fragments: DEFAULT_VOICE_FRAGMENTS, markerFound: false };

  it("trusts the marker", () => {
    expect(detectHandoff({ ...base, markerFound: true, assistantText: "anything" })).toBe(true);
  });

  it("fires when Coco recites the configured escalation fragment", () => {
    expect(
      detectHandoff({
        ...base,
        fragments: { escalation: "Let me get this to Faith's team. They'll reach out at the email you give me." },
        assistantText: "Oh no! Let me get this to Faith's team. They'll reach out at the email you give me.",
      })
    ).toBe(true);
  });

  it("fires on the configured don't-know line too", () => {
    expect(
      detectHandoff({
        ...base,
        fragments: { dont_know: "I want to get this right. Let me check with the team." },
        assistantText: "Hmm, *I want to get this right.* Let me check with the team. What email works?",
      })
    ).toBe(true);
  });

  it("does NOT fire on an informational mention of the support address", () => {
    expect(
      detectHandoff({
        ...base,
        assistantText: "You don't need to contact support@cocolash.com — returns are automatic.",
      })
    ).toBe(false);
  });

  it("free-text mentions of the team never fire, negated or not (Codex MEDIUM)", () => {
    for (const assistantText of [
      "I will not be able to connect you with the team.",
      "I can't guarantee that the team will contact you tomorrow.",
      "I can't connect you with the team.",
      "No worries, the team won't need to reach out to you.",
      "They will not contact you unless you ask.",
    ]) {
      expect(detectHandoff({ ...base, assistantText }), assistantText).toBe(false);
    }
  });

  it("leaves paraphrased hand-offs to the marker Coco is told to emit", () => {
    const assistantText = "Our team will contact you tomorrow about it.";
    expect(detectHandoff({ ...base, assistantText })).toBe(false);
    expect(detectHandoff({ ...base, assistantText, markerFound: true })).toBe(true);
  });

  it("stays quiet on ordinary and empty replies", () => {
    expect(
      detectHandoff({ ...base, assistantText: "Dahlia is wispy, light, and great for everyday wear." })
    ).toBe(false);
    expect(detectHandoff({ ...base, assistantText: "" })).toBe(false);
  });
});

// ── Leads ─────────────────────────────────────────────────────

describe("captureLeadFromChat", () => {
  const input = { sessionId: "s1", email: "jane@x.com" };

  it("saves, emails with a working transcript link, then marks delivered", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cocolash-ai-suite.vercel.app");
    const db = freshDb();
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("emailed");
    expect(db.lead_captures).toHaveLength(1);
    expect(String(db.lead_captures[0].notes)).toContain(EMAILED_MARK);
    const call = vi.mocked(notify.sendLeadEmail).mock.calls[0][0];
    expect(call.to).toBe("support@cocolash.com");
    expect(call.transcriptLink).toContain("/chatbot/admin/transcripts?session=s1");
  });

  it("never re-emails an address already delivered in this session", async () => {
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: `captured${EMAILED_MARK}`, created_at: "2026-10-01" },
    ]);
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("already_emailed");
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
    expect(db.lead_captures).toHaveLength(1);
  });

  it("RETRIES a lead whose earlier email failed (Codex HIGH #1)", async () => {
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: "captured from chat message", created_at: "2026-10-01" },
    ]);
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("emailed");
    expect(notify.sendLeadEmail).toHaveBeenCalledTimes(1);
    expect(db.lead_captures).toHaveLength(1); // no duplicate row
    expect(String(db.lead_captures[0].notes)).toContain(EMAILED_MARK);
  });

  it("leaves a failed send undelivered so it can retry", async () => {
    vi.mocked(notify.sendLeadEmail).mockResolvedValue(FAILED);
    const db = freshDb();
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("send_failed");
    expect(String(db.lead_captures[0].notes)).not.toContain(EMAILED_MARK);
  });

  it("does not count a no-key / dry-run no-op as delivered", async () => {
    vi.mocked(notify.sendLeadEmail).mockResolvedValue(NO_KEY);
    const db = freshDb();
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("send_failed");
    expect(String(db.lead_captures[0].notes)).not.toContain(EMAILED_MARK);
  });

  it("loses a concurrent race cleanly: drops its duplicate, sends nothing (Codex #3)", async () => {
    const db = freshDb();
    const sb = fakeSupabase(db, {
      beforeInsert: (d, now) =>
        d.lead_captures.push({
          id: "competitor",
          session_id: "s1",
          email: "jane@x.com",
          notes: "captured from chat message",
          created_at: now(),
        }),
    });
    expect(await captureLeadFromChat(sb, input)).toBe("duplicate_race");
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
    expect(db.lead_captures.map((r) => r.id)).toEqual(["competitor"]);
  });

  it("two retries of an existing unemailed lead: only the claim winner sends (Codex MEDIUM)", async () => {
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: "captured from chat message", created_at: "2026-10-01" },
    ]);
    const sb = fakeSupabase(db, {
      beforeUpdate: (d) => {
        d.lead_captures[0].notes = "captured from chat message · sending other:c until 9999999999999";
      },
    });
    expect(await captureLeadFromChat(sb, input)).toBe("lost_claim");
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("skips a lead another request is sending right now, retries once its lease expires", async () => {
    const now = Date.UTC(2026, 9, 26);
    const leased = (until: number) =>
      freshDb(null, [
        { id: "l1", session_id: "s1", email: "jane@x.com", notes: `captured from chat message · sending ${now - 60_000}-k1:c until ${until}`, created_at: "2026-10-01" },
      ]);
    expect(await captureLeadFromChat(fakeSupabase(leased(now + 60_000)), input, now)).toBe("in_flight");
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
    expect(await captureLeadFromChat(fakeSupabase(leased(now - 1)), input, now)).toBe("emailed");
  });

  it("sends with an idempotency key naming the lead", async () => {
    const db = freshDb();
    await captureLeadFromChat(fakeSupabase(db), input);
    expect(leadKey(0)).toMatch(new RegExp(`^lead:${db.lead_captures[0].id}:`));
  });

  it("an unconfirmed send keeps its key, and the retry reuses it with the same content (Codex MEDIUM)", async () => {
    vi.mocked(notify.sendLeadEmail).mockResolvedValueOnce(UNCONFIRMED);
    const db = freshDb();
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("send_failed");
    expect(String(db.lead_captures[0].notes)).toMatch(/ · retry [\w-]+$/);
    expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("emailed");
    const [first, retry] = vi.mocked(notify.sendLeadEmail).mock.calls.map((c) => c[0]);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry).toEqual(first);
  });

  it("a later rejected or skipped send never erases an earlier unconfirmed key (Codex MEDIUM)", async () => {
    for (const later of [FAILED, NO_KEY]) {
      vi.mocked(notify.sendLeadEmail)
        .mockReset()
        .mockResolvedValueOnce(UNCONFIRMED)
        .mockResolvedValueOnce(later)
        .mockResolvedValueOnce(SENT);
      const db = freshDb();
      await captureLeadFromChat(fakeSupabase(db), input);
      await captureLeadFromChat(fakeSupabase(db), input);
      expect(String(db.lead_captures[0].notes)).toMatch(/ · retry [\w-]+$/);
      expect(await captureLeadFromChat(fakeSupabase(db), input)).toBe("emailed");
      const calls = vi.mocked(notify.sendLeadEmail).mock.calls.map((c) => c[0]);
      expect(calls[1]).toEqual(calls[0]);
      expect(calls[2]).toEqual(calls[0]);
    }
  });

  it("a send Resend rejected gets a fresh key next time", async () => {
    vi.mocked(notify.sendLeadEmail).mockResolvedValueOnce(FAILED);
    const db = freshDb();
    await captureLeadFromChat(fakeSupabase(db), input);
    expect(db.lead_captures[0].notes).toBe("captured from chat message");
    await captureLeadFromChat(fakeSupabase(db), input);
    expect(leadKey(1)).not.toBe(leadKey(0));
  });

  it("recovering an expired lease reuses that sender's key (Codex MEDIUM)", async () => {
    const now = Date.UTC(2026, 9, 26);
    const key = `${now - 5 * 60_000}-k1`;
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: `captured from chat message · sending ${key}:c until ${now - 1}`, created_at: "2026-10-01" },
    ]);
    expect(await captureLeadFromChat(fakeSupabase(db), input, now)).toBe("emailed");
    expect(leadKey(0)).toBe(`lead:l1:${key}`);
  });

  it("never re-sends an unconfirmed lead once Resend has forgotten its key (Codex MEDIUM)", async () => {
    const now = Date.UTC(2026, 9, 26);
    const notes = `captured from chat message · retry ${now - DEDUPE_WINDOW_MS}-k1`;
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes, created_at: "2026-10-01" },
    ]);
    expect(await captureLeadFromChat(fakeSupabase(db), input, now)).toBe("unconfirmed");
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
    expect(db.lead_captures[0].notes).toBe(notes);
  });

  it("keeps the 'handed off' wording on a retry even if the flag changed since", async () => {
    vi.mocked(notify.sendLeadEmail).mockResolvedValueOnce(UNCONFIRMED);
    const db = freshDb(`${FOLLOW_UP_PENDING_PREFIX}refund please`);
    await captureLeadFromChat(fakeSupabase(db), input);
    db.chat_sessions[0].intent_summary = null;
    await captureLeadFromChat(fakeSupabase(db), input);
    const [first, retry] = vi.mocked(notify.sendLeadEmail).mock.calls.map((c) => c[0]);
    expect(retry.notes).toBe(first.notes);
    expect(retry.notes).toContain("handed off to the team");
  });

  it("sends nothing when the lead could not be saved", async () => {
    const db = freshDb();
    expect(await captureLeadFromChat(fakeSupabase(db, { failInsert: true }), input)).toBe(
      "save_failed"
    );
    expect(notify.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("tells the team when the customer was handed off", async () => {
    const db = freshDb(`${FOLLOW_UP_PENDING_PREFIX}refund please`);
    await captureLeadFromChat(fakeSupabase(db), input);
    expect(vi.mocked(notify.sendLeadEmail).mock.calls[0][0].notes).toContain(
      "handed off to the team"
    );
  });
});

// ── Handoffs ──────────────────────────────────────────────────

describe("flagHandoff", () => {
  const input = {
    sessionId: "s1",
    customerMessage: "My kit arrived damaged and I want a refund",
  };

  it("claims, emails the customer's message + email, then marks delivered", async () => {
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: "x", created_at: "2026-10-01" },
    ]);
    expect(await flagHandoff(fakeSupabase(db), input)).toBe("emailed");
    expect(db.chat_sessions[0].intent_summary).toBe(`${FOLLOW_UP_PREFIX}${input.customerMessage}`);
    const call = vi.mocked(notify.sendHandoffEmail).mock.calls[0][0];
    expect(call.customerEmail).toBe("jane@x.com");
    expect(call.customerMessage).toBe(input.customerMessage);
    expect(call.transcriptLink).toContain("?session=s1");
  });

  it("uses an email the customer typed in the hand-off message itself", async () => {
    await flagHandoff(fakeSupabase(freshDb()), {
      sessionId: "s1",
      customerMessage: "Refund please, I'm Kim@Example.com",
    });
    expect(vi.mocked(notify.sendHandoffEmail).mock.calls[0][0].customerEmail).toBe("kim@example.com");
  });

  it("never re-emails a delivered handoff", async () => {
    const db = freshDb(`${FOLLOW_UP_PREFIX}earlier issue`);
    expect(await flagHandoff(fakeSupabase(db), input)).toBe("already_emailed");
    expect(notify.sendHandoffEmail).not.toHaveBeenCalled();
  });

  it("RETRIES a handoff whose email failed, keeping the original reason (Codex HIGH #1)", async () => {
    const db = freshDb(`${FOLLOW_UP_PENDING_PREFIX}original complaint`);
    expect(await flagHandoff(fakeSupabase(db), input)).toBe("emailed");
    expect(db.chat_sessions[0].intent_summary).toBe(`${FOLLOW_UP_PREFIX}original complaint`);
  });

  it("stays flagged-but-pending when the send fails", async () => {
    vi.mocked(notify.sendHandoffEmail).mockResolvedValue(FAILED);
    const db = freshDb();
    expect(await flagHandoff(fakeSupabase(db), input)).toBe("send_failed");
    expect(db.chat_sessions[0].intent_summary).toBe(
      `${FOLLOW_UP_PENDING_PREFIX}${input.customerMessage}`
    );
  });

  it("only the request that wins the atomic claim sends (Codex #3)", async () => {
    const db = freshDb();
    const sb = fakeSupabase(db, {
      beforeUpdate: (d) => {
        d.chat_sessions[0].intent_summary = `${FOLLOW_UP_PENDING_PREFIX}claimed elsewhere`;
      },
    });
    expect(await flagHandoff(sb, input)).toBe("lost_claim");
    expect(notify.sendHandoffEmail).not.toHaveBeenCalled();
  });

  it("two retries of a pending handoff: only the claim winner sends (Codex MEDIUM)", async () => {
    const db = freshDb(`${FOLLOW_UP_PENDING_PREFIX}original complaint`);
    const sb = fakeSupabase(db, {
      beforeUpdate: (d) => {
        d.chat_sessions[0].intent_summary = "Needs follow-up (sending other:c until 9999999999999): original complaint";
      },
    });
    expect(await flagHandoff(sb, input)).toBe("lost_claim");
    expect(notify.sendHandoffEmail).not.toHaveBeenCalled();
  });

  it("skips a handoff being sent right now, retries once the lease expires", async () => {
    const now = Date.UTC(2026, 9, 26);
    const sending = (until: number) =>
      freshDb(`Needs follow-up (sending ${now - 60_000}-k1:c until ${until}): broken box`);
    expect(await flagHandoff(fakeSupabase(sending(now + CLAIM_LEASE_MS)), input, now)).toBe("in_flight");
    expect(notify.sendHandoffEmail).not.toHaveBeenCalled();
    const db = sending(now - 1);
    expect(await flagHandoff(fakeSupabase(db), input, now)).toBe("emailed");
    expect(db.chat_sessions[0].intent_summary).toBe(`${FOLLOW_UP_PREFIX}broken box`);
  });

  it("sends with an idempotency key naming the session", async () => {
    await flagHandoff(fakeSupabase(freshDb()), input);
    expect(handoffKey(0)).toMatch(/^handoff:s1:/);
  });

  it("an unconfirmed send is retried as the identical request — same key, same content (Codex MEDIUM)", async () => {
    vi.mocked(notify.sendHandoffEmail).mockResolvedValueOnce(UNCONFIRMED);
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "jane@x.com", notes: "x", created_at: "2026-10-01" },
    ]);
    expect(await flagHandoff(fakeSupabase(db), input)).toBe("send_failed");
    expect(String(db.chat_sessions[0].intent_summary)).toMatch(
      /^Needs follow-up \(email pending, retry [\w-]+, contact jane@x\.com\): /
    );
    // The customer shares a different address before the next hand-off.
    db.lead_captures.push({ id: "l2", session_id: "s1", email: "new@x.com", notes: "x", created_at: "2026-10-02" });
    expect(
      await flagHandoff(fakeSupabase(db), { sessionId: "s1", customerMessage: "hello? still waiting" })
    ).toBe("emailed");
    const [first, retry] = vi.mocked(notify.sendHandoffEmail).mock.calls.map((c) => c[0]);
    expect(retry).toEqual(first);
    expect(db.chat_sessions[0].intent_summary).toBe(`${FOLLOW_UP_PREFIX}${input.customerMessage}`);
  });

  it("recovering an expired lease reuses that sender's key and frozen contact (Codex MEDIUM)", async () => {
    const now = Date.UTC(2026, 9, 26);
    const key = `${now - 5 * 60_000}-k1`;
    const db = freshDb(`Needs follow-up (sending ${key}:c until ${now - 1}, contact jane@x.com): broken box`);
    expect(await flagHandoff(fakeSupabase(db), input, now)).toBe("emailed");
    const call = vi.mocked(notify.sendHandoffEmail).mock.calls[0][0];
    expect(call.idempotencyKey).toBe(`handoff:s1:${key}`);
    expect(call.customerEmail).toBe("jane@x.com");
    expect(call.customerMessage).toBe("broken box");
  });

  it("never re-sends an unconfirmed handoff once Resend has forgotten its key (Codex MEDIUM)", async () => {
    const now = Date.UTC(2026, 9, 26);
    const summary = `Needs follow-up (email pending, retry ${now - DEDUPE_WINDOW_MS}-k1): broken box`;
    const db = freshDb(summary);
    expect(await flagHandoff(fakeSupabase(db), input, now)).toBe("unconfirmed");
    expect(notify.sendHandoffEmail).not.toHaveBeenCalled();
    expect(db.chat_sessions[0].intent_summary).toBe(summary);
    expect(isFlaggedForFollowUp(summary)).toBe(true); // still on the team's list
  });

  it("keys carry their mint time; unreadable keys are never auto-retried", () => {
    const now = Date.UTC(2026, 9, 26);
    expect(keyStillDeduplicated(`${now - 1000}-abc`, now)).toBe(true);
    expect(keyStillDeduplicated(`h-${now - 1000}-abc`, now)).toBe(true);
    expect(keyStillDeduplicated(`${now - DEDUPE_WINDOW_MS}-abc`, now)).toBe(false);
    expect(keyStillDeduplicated("k-1", now)).toBe(false);
    expect(DEDUPE_WINDOW_MS).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("a later rejected or skipped send never erases an earlier unconfirmed key (Codex MEDIUM)", async () => {
    for (const later of [FAILED, NO_KEY]) {
      vi.mocked(notify.sendHandoffEmail)
        .mockReset()
        .mockResolvedValueOnce(UNCONFIRMED)
        .mockResolvedValueOnce(later)
        .mockResolvedValueOnce(SENT);
      const db = freshDb(null, [
        { id: "l1", session_id: "s1", email: "jane@x.com", notes: "x", created_at: "2026-10-01" },
      ]);
      await flagHandoff(fakeSupabase(db), input);
      await flagHandoff(fakeSupabase(db), { sessionId: "s1", customerMessage: "anyone there?" });
      expect(parseFollowUp(String(db.chat_sessions[0].intent_summary))).toMatchObject({
        state: "pending",
        contact: "jane@x.com",
      });
      expect(await flagHandoff(fakeSupabase(db), input)).toBe("emailed");
      const calls = vi.mocked(notify.sendHandoffEmail).mock.calls.map((c) => c[0]);
      expect(calls[1]).toEqual(calls[0]);
      expect(calls[2]).toEqual(calls[0]);
    }
  });

  it("a send Resend rejected gets a fresh key (and fresh contact) next time", async () => {
    vi.mocked(notify.sendHandoffEmail).mockResolvedValueOnce(FAILED);
    const db = freshDb();
    await flagHandoff(fakeSupabase(db), input);
    expect(db.chat_sessions[0].intent_summary).toBe(`${FOLLOW_UP_PENDING_PREFIX}${input.customerMessage}`);
    await flagHandoff(fakeSupabase(db), input);
    expect(handoffKey(1)).not.toBe(handoffKey(0));
  });

  it("never freezes a contact that would break the flag format", async () => {
    const db = freshDb(null, [
      { id: "l1", session_id: "s1", email: "odd(name)@x.com", notes: "x", created_at: "2026-10-01" },
    ]);
    vi.mocked(notify.sendHandoffEmail).mockResolvedValueOnce(UNCONFIRMED);
    await flagHandoff(fakeSupabase(db), input);
    expect(parseFollowUp(String(db.chat_sessions[0].intent_summary)).state).toBe("pending");
    expect(vi.mocked(notify.sendHandoffEmail).mock.calls[0][0].customerEmail).toBeNull();
  });

  it("still emails when the customer hasn't shared an email yet", async () => {
    const db = freshDb();
    await flagHandoff(fakeSupabase(db), input);
    expect(vi.mocked(notify.sendHandoffEmail).mock.calls[0][0].customerEmail).toBeNull();
  });
});

// ── The email transport ───────────────────────────────────────

describe("sendHandoffEmail / Resend transport", () => {
  const msg = {
    to: "support@cocolash.com",
    fromName: "CocoLash AI",
    fromEmail: "leads@cocolash.com",
    customerMessage: "<script>alert(1)</script> my order is broken",
    customerEmail: "jane@x.com",
    transcriptLink: "https://x/t?session=1",
  };
  const real = () => vi.importActual<typeof import("@/lib/chat/notify")>("@/lib/chat/notify");

  it("reports a no-key run as 'skipped', never as a real send", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    expect((await (await real()).sendHandoffEmail(msg)).via).toBe("skipped");
  });

  it("sends a clear subject and escapes customer text", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await real()).sendHandoffEmail(msg)).toEqual({ ok: true, via: "resend" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toMatch(/^Coco needs a human: "/);
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.text).toContain("jane@x.com");
  });

  it("retries once on a transient 5xx", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "busy" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await real()).sendHandoffEmail(msg)).toEqual({ ok: true, via: "resend" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the SAME idempotency key and payload on the retry (Codex MEDIUM)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await (await real()).sendHandoffEmail({ ...msg, idempotencyKey: "handoff:s1:tok" });
    const [first, second] = fetchMock.mock.calls.map((c) => c[1]);
    expect(first.headers["idempotency-key"]).toBe("handoff:s1:tok");
    expect(second.headers["idempotency-key"]).toBe("handoff:s1:tok");
    expect(second.body).toBe(first.body);
  });

  it("does not retry a permanent 4xx (e.g. invalid key) and reports it as rejected", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_bad");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => "API key is invalid" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await real()).sendHandoffEmail(msg);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("401");
    expect(res.rejected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports timeouts, 5xx and every 409 as unconfirmed, never rejected (Codex MEDIUM)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const concurrent = { ok: false, status: 409, text: async () => '{"name":"concurrent_idempotent_requests"}' };
    const keyReused = { ok: false, status: 409, text: async () => '{"name":"invalid_idempotent_request"}' };
    const unreadable409 = {
      ok: false,
      status: 409,
      text: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    };
    for (const failure of [
      () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      () => Promise.resolve({ ok: false, status: 503, text: async () => "busy" }),
      () => Promise.resolve(concurrent),
      () => Promise.resolve(keyReused),
      () => Promise.resolve(unreadable409),
    ]) {
      const fetchMock = vi.fn().mockImplementation(failure);
      vi.stubGlobal("fetch", fetchMock);
      const res = await (await real()).sendHandoffEmail(msg);
      expect(res.ok).toBe(false);
      expect(res.rejected).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it("a rejection after an unconfirmed attempt leaves the call unconfirmed (Codex MEDIUM)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "API key is invalid" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await real()).sendHandoffEmail(msg);
    expect(res.ok).toBe(false);
    expect(res.rejected).toBeUndefined();
  });

  it("bounds every request with a timeout well inside the claim lease (Codex MEDIUM)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("LEAD_EMAIL_DRY_RUN", "");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await (await real()).sendHandoffEmail(msg);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    const { MAX_RESEND_MS } = await real();
    expect(MAX_RESEND_MS).toBeGreaterThan(0);
    expect(MAX_RESEND_MS * 4).toBeLessThanOrEqual(CLAIM_LEASE_MS);
  });
});

// ── Admin writes: the silent-success bug ──────────────────────

describe("admin writes", () => {
  it("records the access-password admin as null, never a non-uuid string", () => {
    expect(auditUserId("access-password")).toBeNull();
    expect(auditUserId("3f1c2a4e-1b2c-4d5e-8f90-123456789abc")).toBe(
      "3f1c2a4e-1b2c-4d5e-8f90-123456789abc"
    );
  });

  it("refuses to report a zero-row update as saved", () => {
    expect(() => assertRowsUpdated([], "voice_fragments")).toThrow(/no row was updated/);
    expect(() => assertRowsUpdated(null, "voice_fragments")).toThrow();
    expect(() => assertRowsUpdated([{ id: "1" }], "voice_fragments")).not.toThrow();
  });

  it("the write client carries no cookies or session (Codex #4)", () => {
    const helper = src("lib/chat/admin-write.ts");
    expect(helper).toContain("persistSession: false");
    expect(helper).toContain('from "@supabase/supabase-js"');
  });

  it("Voice, Settings and Discounts write through it and check the row count", () => {
    for (const route of ["voice", "settings", "discounts"]) {
      const s = src(`app/api/chatbot/admin/${route}/route.ts`);
      expect(s, route).toContain("createServiceRoleClient()");
      expect(s, route).toContain("assertRowsUpdated(");
      expect(s, route).not.toContain("createAdminClient");
    }
  });
});

// ── Route wiring ──────────────────────────────────────────────

describe("chat route wiring", () => {
  const route = src("app/api/chat/route.ts");

  it("saves + notifies leads AFTER the response, never on the reply path (Codex #5)", () => {
    expect(route).toContain('runAfterResponse("lead_capture"');
    expect(route).not.toContain("await captureLeadFromChat");
    expect(route).not.toContain('from("lead_captures").insert');
  });

  it("flags handoffs after the assistant turn is persisted, off the reply path", () => {
    const persisted = route.indexOf('role: "assistant",\n        content: assistantText');
    const scheduled = route.indexOf('runAfterResponse("handoff"');
    expect(persisted).toBeGreaterThan(-1);
    expect(scheduled).toBeGreaterThan(persisted);
    expect(route).not.toContain("await flagHandoff");
  });

  it("the Transcripts page shows and filters both flag states", () => {
    const page = src("app/(protected)/chatbot/admin/transcripts/page.tsx");
    expect(page).toContain("Needs follow-up");
    expect(page).toContain('"Needs follow-up%"');
    expect(page).toContain('params.filter === "follow-up"');
  });
});
