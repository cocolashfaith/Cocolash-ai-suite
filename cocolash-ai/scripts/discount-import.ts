/**
 * scripts/discount-import.ts — Idempotent import of Faith's Shopify
 * discounts_export.csv into the discount_rules table.
 *
 * Mirrors the CSV's structure faithfully into the schema:
 *   - "Combines with *" columns → combinability jsonb
 *   - Start / End → campaign_window tstzrange
 *   - Times Used / Applies Once Per Customer / Usage Limit Per Code
 *   - Customer Selection / Status
 *   - Defaults intent_triggers + product_line_scope to NULL (Phase 7
 *     admin UI can set these later).
 *
 * Run:
 *   npx tsx scripts/discount-import.ts
 *   npx tsx scripts/discount-import.ts --dry-run   # parse + report only
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CSV_PATH = "public/brand/discounts_export.csv";

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  return { dryRun: argv.includes("--dry-run") };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQ = false;
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQ = true;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function toRangeLiteral(start: string, end: string): string | null {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (!s && !e) return null;
  // tstzrange literal: open-ended bounds use infinity / -infinity.
  // Postgres rejects empty quoted strings ('') as timestamps.
  const lo = s ? `"${s}"` : "-infinity";
  const hi = e ? `"${e}"` : "infinity";
  return `[${lo},${hi})`;
}

function statusFromCsv(raw: string): "active" | "paused" | "expired" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "active") return "active";
  if (v === "expired") return "expired";
  return "paused";
}

function valueAndType(raw: string, vType: string): { value: number; value_type: "percentage" | "fixed_amount" } {
  // CSV stores "-15.0" for 15% off and "-5.00" for $5 off; type column already disambiguates.
  const num = parseFloat(raw);
  const type = vType === "percentage" ? "percentage" : "fixed_amount";
  return { value: Number.isFinite(num) ? num : 0, value_type: type };
}

function discountClass(raw: string): "order" | "product" | "shipping" {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "product") return "product";
  if (v === "shipping") return "shipping";
  return "order";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const csvText = readFileSync(path.join(repoRoot, CSV_PATH), "utf-8");
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("Empty discount CSV");
  const header = rows[0];

  const idx = (name: string): number => header.indexOf(name);
  const NAME = idx("Name");
  const VALUE = idx("Value");
  const VALUE_TYPE = idx("Value Type");
  const DISCOUNT_CLASS = idx("Discount Class");
  const COMBINES_ORDER = idx("Combines with Order Discounts");
  const COMBINES_PRODUCT = idx("Combines with Product Discounts");
  const COMBINES_SHIPPING = idx("Combines with Shipping Discounts");
  const CUSTOMER_SELECTION = idx("Customer Selection");
  const TIMES_USED = idx("Times Used In Total");
  const APPLIES_ONCE = idx("Applies Once Per Customer");
  const USAGE_LIMIT = idx("Usage Limit Per Code");
  const STATUS = idx("Status");
  const START = idx("Start");
  const END = idx("End");

  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const code = row[NAME]?.trim();
    if (!code) continue;
    const { value, value_type } = valueAndType(row[VALUE] ?? "0", row[VALUE_TYPE] ?? "");
    records.push({
      code,
      value,
      value_type,
      discount_class: discountClass(row[DISCOUNT_CLASS] ?? ""),
      combinability: {
        order: !!row[COMBINES_ORDER]?.trim(),
        product: !!row[COMBINES_PRODUCT]?.trim(),
        shipping: !!row[COMBINES_SHIPPING]?.trim(),
      },
      customer_selection: row[CUSTOMER_SELECTION]?.trim() || "all",
      campaign_window: toRangeLiteral(row[START] ?? "", row[END] ?? ""),
      applies_once_per_customer:
        (row[APPLIES_ONCE]?.trim() ?? "") === "" ? null : (row[APPLIES_ONCE]?.trim() === "1" || row[APPLIES_ONCE]?.trim().toLowerCase() === "true"),
      usage_limit_per_code: row[USAGE_LIMIT]?.trim() ? Number(row[USAGE_LIMIT]) : null,
      times_used: row[TIMES_USED]?.trim() ? Number(row[TIMES_USED]) : 0,
      status: statusFromCsv(row[STATUS] ?? ""),
    });
  }

  process.stdout.write(`\n[discount-import] Parsed ${records.length} rules from ${CSV_PATH}\n`);
  if (args.dryRun) {
    process.stdout.write(`Dry run — first 3 rows:\n`);
    for (const r of records.slice(0, 3)) {
      process.stdout.write(`  ${(r as { code: string; value: number; value_type: string }).code} ${r.value_type === "percentage" ? `${r.value}%` : `$${r.value}`}\n`);
    }
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  for (const rec of records) {
    const { data, error } = await supabase
      .from("discount_rules")
      .upsert(rec, { onConflict: "code" })
      .select("id")
      .single();
    if (error || !data) {
      failed += 1;
      process.stderr.write(`  fail ${(rec as { code: string }).code}: ${error?.message ?? "no row"}\n`);
      continue;
    }
    // We can't tell insert vs update from upsert, so increment inserted as a stand-in.
    inserted += 1;
  }
  process.stdout.write(`\n── Import report ──\nWritten:  ${inserted}\nUpdated:  ${updated}\nFailed:   ${failed}\nDone.\n`);
}

main().catch((err) => {
  process.stderr.write(`\n[discount-import] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
