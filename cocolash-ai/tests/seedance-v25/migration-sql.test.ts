import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SEEDANCE25_MIGRATION_FILE } from "@/lib/supabase/schema-errors";
import { SEEDANCE_25_RATES_DEFAULT } from "@/lib/seedance/pricing";
import { VIDEO_SETTINGS_SINGLETON_ID } from "@/lib/settings/video-settings";

/**
 * Guards the ONE migration Harry pastes into the Supabase SQL editor
 * (02-DECISIONS.md hard constraint). Keeps the SQL, the TS types and the
 * pricing seed in lock-step.
 */
const sql = readFileSync(path.resolve(process.cwd(), SEEDANCE25_MIGRATION_FILE), "utf8");

const NEW_COLUMNS = [
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
];

describe("supabase/migrations/20260908_seedance25.sql", () => {
  it("exists at the path the app tells the user to paste", () => {
    expect(SEEDANCE25_MIGRATION_FILE).toBe("supabase/migrations/20260908_seedance25.sql");
    expect(sql.length).toBeGreaterThan(1000);
    expect(sql).toMatch(/HOW TO APPLY/);
    expect(sql).toMatch(/SQL Editor/);
  });

  it("adds every generated_videos column idempotently", () => {
    for (const col of NEW_COLUMNS) {
      expect(sql, col).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
    }
    expect(sql).toMatch(/engine\s+TEXT NOT NULL DEFAULT '2\.0'/);
    expect(sql).toMatch(/credits_cost\s+NUMERIC\(12,3\)/);
    expect(sql).toMatch(/rerender_of\s+UUID REFERENCES generated_videos\(id\)/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_generated_videos_engine/);
  });

  it("guards CHECK constraints and policies with DO blocks (re-runnable)", () => {
    expect(sql).toMatch(/generated_videos_engine_check/);
    expect(sql).toMatch(/CHECK \(engine IN \('2\.0', '2\.5'\)\)/);
    expect((sql.match(/DO \$\$/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Destructive statements may only appear inside the commented ROLLBACK block.
    for (const line of sql.split("\n")) {
      if (/DROP (TABLE|COLUMN|POLICY)/.test(line)) {
        expect(line.trim().startsWith("--"), `uncommented destructive SQL: ${line}`).toBe(true);
      }
    }
  });

  it("creates the video_settings singleton with the seed row and pricing", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS video_settings/);
    expect(sql).toMatch(/is_singleton\s+BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(sql).toMatch(/UNIQUE \(is_singleton\)/);
    expect(sql).toMatch(/default_engine\s+TEXT NOT NULL DEFAULT '2\.5'/);
    expect(sql).toMatch(/default_quality_tier\s+TEXT NOT NULL DEFAULT 'draft-720p'/);
    expect(sql).toMatch(/default_duration\s+INTEGER NOT NULL DEFAULT 8/);
    expect(sql).toMatch(/usd_per_credit\s+NUMERIC\(10,6\) NOT NULL DEFAULT 0\.001/);
    expect(sql).toContain(VIDEO_SETTINGS_SINGLETON_ID);
    expect(sql).toMatch(/ON CONFLICT \(is_singleton\) DO NOTHING/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it("seeds the JSONB rates with exactly the TypeScript seed table", () => {
    const start = sql.indexOf("$json$");
    const end = sql.indexOf("$json$", start + 6);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const json = JSON.parse(sql.slice(start + 6, end));
    expect(json).toEqual(SEEDANCE_25_RATES_DEFAULT);
  });

  it("re-asserts the video-inputs bucket without failing when it exists", () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets/);
    expect(sql).toMatch(/'video-inputs'/);
    expect(sql).toMatch(/52428800/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });
});
