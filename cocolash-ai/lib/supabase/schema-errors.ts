/**
 * Detecting "the migration has not been applied yet" from Supabase/PostgREST
 * errors — so routes can return a clear 503 instead of a generic 500.
 *
 * Why two code families:
 *   - Filtering / selecting a column that does not exist surfaces the raw
 *     Postgres code `42703` (undefined_column).
 *   - INSERT / UPDATE with an unknown column is rejected by PostgREST itself
 *     with `PGRST204` ("Could not find the 'engine' column of
 *     'generated_videos' in the schema cache").
 *   - A missing TABLE is `42P01` (undefined_table) from Postgres, or
 *     `PGRST205` ("Could not find the table … in the schema cache").
 *
 * Constraint (02-DECISIONS.md): there is no SQL execution path from this
 * machine — Harry pastes the migration into the Supabase SQL editor. Until
 * then Seedance 2.5 must fail loudly and Seedance 2.0 must keep working.
 */

export const SEEDANCE25_MIGRATION_FILE = "supabase/migrations/20260908_seedance25.sql";

export const MIGRATION_REQUIRED_CODE = "migration_required" as const;

export const MIGRATION_REQUIRED_STATUS = 503;

export const MIGRATION_REQUIRED_MESSAGE =
  `Database migration not applied — paste ${SEEDANCE25_MIGRATION_FILE} into the Supabase SQL editor and run it, then retry.`;

export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function asError(err: unknown): PostgrestLikeError | null {
  if (!err || typeof err !== "object") return null;
  return err as PostgrestLikeError;
}

/** `42703` / `PGRST204` / "column … does not exist" / "Could not find the '…' column". */
export function isMissingColumnError(err: unknown): boolean {
  const e = asError(err);
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return /column .* does not exist/i.test(msg) || /could not find the '.*' column/i.test(msg);
}

/** `42P01` / `PGRST205` / "relation … does not exist" / "Could not find the table". */
export function isMissingTableError(err: unknown): boolean {
  const e = asError(err);
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return /relation .* does not exist/i.test(msg) || /could not find the table/i.test(msg);
}

/** Either of the above — "the 20260908 migration is not applied". */
export function isSchemaMissingError(err: unknown): boolean {
  return isMissingColumnError(err) || isMissingTableError(err);
}

export interface MigrationRequiredBody {
  error: string;
  code: typeof MIGRATION_REQUIRED_CODE;
  migration: string;
  detail?: string;
}

/** JSON body for the 503 response. Never leaks the raw SQL error to the UI beyond `detail`. */
export function migrationRequiredBody(err?: unknown): MigrationRequiredBody {
  const e = asError(err);
  return {
    error: MIGRATION_REQUIRED_MESSAGE,
    code: MIGRATION_REQUIRED_CODE,
    migration: SEEDANCE25_MIGRATION_FILE,
    ...(e?.message ? { detail: e.message } : {}),
  };
}

/**
 * A row fetched with `select("*")` reveals whether the migration is applied:
 * the new columns are present (possibly null) only after it ran. Use this
 * before writing `credits_cost` / `error_message` etc. on a 2.0 row so the
 * legacy path never trips PGRST204.
 */
export function rowHasSeedance25Columns(
  row: Record<string, unknown> | null | undefined
): boolean {
  return !!row && typeof row === "object" && "credits_cost" in row && "engine" in row;
}
