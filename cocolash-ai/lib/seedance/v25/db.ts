/**
 * Every `generated_videos` write that can touch a Seedance 2.5 column goes
 * through this module.
 *
 * Why: there is no SQL execution path from this machine (02-DECISIONS.md) — the
 * migration `supabase/migrations/20260908_seedance25.sql` is pasted into the
 * Supabase SQL editor by hand. Until it lands, the 14 new columns do not exist:
 *
 *   - INSERTing a 2.5 row fails → `migrationRequired` → the route answers 503
 *     and NOTHING is queued (a failed insert must never bill an Enhancor job).
 *   - UPDATEing a legacy 2.0 row with a new column (e.g. `error_message`) would
 *     fail the whole patch → `safeUpdateVideo` strips the 2.5 columns and
 *     retries, so the 2.0 pipeline keeps working byte-for-byte.
 *
 * Reads always use `select("*")` — never name a new column in a shared path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingColumnError,
  isSchemaMissingError,
  type PostgrestLikeError,
} from "@/lib/supabase/schema-errors";
import type { GeneratedVideo } from "@/lib/types";

/** The 14 columns added by supabase/migrations/20260908_seedance25.sql. */
export const SEEDANCE25_COLUMNS = [
  "engine",
  "seedance_mode",
  "quality_tier",
  "resolution",
  "requested_duration",
  "input_urls",
  "request_payload",
  "credits_cost",
  "error_message",
  "rerender_of",
  "output_format",
  "bitrate_mode",
  "is_uncensored",
  "pass_faces",
] as const;

export type Seedance25Column = (typeof SEEDANCE25_COLUMNS)[number];

const SEEDANCE25_COLUMN_SET: ReadonlySet<string> = new Set(SEEDANCE25_COLUMNS);

const VIDEOS_TABLE = "generated_videos";

/** `error_message` is TEXT, but we never store a provider dump — cap at 500 chars. */
export const MAX_ERROR_MESSAGE_CHARS = 500;

export function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_CHARS
    ? message.slice(0, MAX_ERROR_MESSAGE_CHARS)
    : message;
}

export type VideoPatch = Record<string, unknown>;

export interface SafeUpdateResult {
  error: PostgrestLikeError | null;
  /** true when the first attempt failed on a missing column and we retried without the 2.5 columns. */
  strippedColumns: boolean;
}

function stripSeedance25Columns(patch: VideoPatch): VideoPatch {
  const out: VideoPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!SEEDANCE25_COLUMN_SET.has(key)) out[key] = value;
  }
  return out;
}

function hasSeedance25Columns(patch: VideoPatch): boolean {
  return Object.keys(patch).some((key) => SEEDANCE25_COLUMN_SET.has(key));
}

/**
 * UPDATE a `generated_videos` row, tolerating a not-yet-applied migration:
 * on `42703` / `PGRST204` the 2.5 columns are dropped and the update is retried
 * so the legacy fields (status, completed_at, …) still land.
 */
export async function safeUpdateVideo(
  supabase: SupabaseClient,
  id: string,
  patch: VideoPatch
): Promise<SafeUpdateResult> {
  const { error } = await supabase.from(VIDEOS_TABLE).update(patch).eq("id", id);

  if (!error) return { error: null, strippedColumns: false };

  if (!isMissingColumnError(error) || !hasSeedance25Columns(patch)) {
    return { error: error as PostgrestLikeError, strippedColumns: false };
  }

  const fallback = stripSeedance25Columns(patch);
  if (Object.keys(fallback).length === 0) {
    return { error: error as PostgrestLikeError, strippedColumns: false };
  }

  console.warn(
    `[seedance2.5/db] Seedance 2.5 columns missing on ${VIDEOS_TABLE} — retrying update without them (run the 20260908 migration).`
  );

  const { error: retryError } = await supabase.from(VIDEOS_TABLE).update(fallback).eq("id", id);

  return { error: (retryError as PostgrestLikeError) ?? null, strippedColumns: true };
}

export type InsertSeedance25RowResult =
  | { ok: true; id: string }
  | { ok: false; migrationRequired: boolean; error: PostgrestLikeError };

/**
 * INSERT the 2.5 row. Called BEFORE `/queue` — so a schema failure costs
 * nothing. `migrationRequired` maps straight onto the 503 body from
 * lib/supabase/schema-errors.ts.
 */
export async function insertSeedance25Row(
  supabase: SupabaseClient,
  row: Record<string, unknown>
): Promise<InsertSeedance25RowResult> {
  const { data, error } = await supabase
    .from(VIDEOS_TABLE)
    .insert(row)
    .select("id")
    .single();

  if (error || !data?.id) {
    const err = (error ?? { message: "Insert returned no row" }) as PostgrestLikeError;
    const migrationRequired = isSchemaMissingError(error);
    console.error(
      `[seedance2.5/db] Insert failed (migrationRequired=${migrationRequired}):`,
      err.message ?? err
    );
    return { ok: false, migrationRequired, error: err };
  }

  return { ok: true, id: data.id as string };
}

/**
 * Look a Seedance row up by its provider request id. Used by the shared webhook
 * for BOTH engines — `pipeline` is still `'seedance'` on 2.5 rows; `engine`
 * discriminates.
 */
export async function findSeedanceVideoByTaskId(
  supabase: SupabaseClient,
  requestId: string
): Promise<GeneratedVideo | null> {
  const { data, error } = await supabase
    .from(VIDEOS_TABLE)
    .select("*")
    .eq("seedance_task_id", requestId)
    .eq("pipeline", "seedance")
    .maybeSingle();

  if (error) {
    console.error("[seedance2.5/db] Lookup by task id failed:", error);
    return null;
  }

  return (data as GeneratedVideo | null) ?? null;
}
