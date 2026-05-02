/**
 * lib/log.ts — Structured JSON logger.
 *
 * Replaces `process.stdout.write` / `console.*` in new chat code. M1/M2
 * console.* calls are NOT migrated by this phase (CONCERNS.md item).
 *
 * Levels: debug < info < warn < error. Threshold via LOG_LEVEL env
 * (default 'info' in prod, 'debug' in dev).
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function currentThreshold(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  if (env in LEVELS) return LEVELS[env];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function emit(level: Level, msg: string, fields: Record<string, unknown>): void {
  if (LEVELS[level] < currentThreshold()) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  const out = JSON.stringify(entry) + "\n";
  if (level === "error") {
    process.stderr.write(out);
  } else {
    process.stdout.write(out);
  }
}

export interface Logger {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  child: (extras: Record<string, unknown>) => Logger;
}

function makeLogger(base: Record<string, unknown>): Logger {
  const wrap = (level: Level) => (msg: string, fields: Record<string, unknown> = {}) =>
    emit(level, msg, { ...base, ...fields });
  return {
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
    child: (extras) => makeLogger({ ...base, ...extras }),
  };
}

export const log: Logger = makeLogger({});
