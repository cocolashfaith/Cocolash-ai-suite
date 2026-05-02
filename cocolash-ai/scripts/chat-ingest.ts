/**
 * scripts/chat-ingest.ts — Idempotent ingest of CocoLash knowledge into pgvector.
 *
 * Reads:
 *   - public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md
 *   - public/brand/products_export_1 (1).csv
 *
 * Chunks by:
 *   - One FAQ Q+A pair → one chunk (tier 1, source_type "faq_kb")
 *   - One product entry in §2 → one chunk (tier 2, source_type "product_md")
 *   - One Shopify product (CSV) → one chunk (tier 2, source_type "product_csv")
 *   - One conversation-style block in §3 → one chunk (tier 1, source_type "voice_doc")
 *
 * Embeds with OpenAI text-embedding-3-small, upserts via lib/chat/db.ts.
 * Idempotent via content_hash; no-ops on unchanged chunks.
 *
 * Usage:
 *   npx tsx scripts/chat-ingest.ts                  # full ingest
 *   npx tsx scripts/chat-ingest.ts --dry-run        # parse + report only, no embedding/DB
 *   npx tsx scripts/chat-ingest.ts --prune          # delete chunks no longer in source
 *   npx tsx scripts/chat-ingest.ts --only=faq_kb    # ingest only one source_type
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { embedMany, contentHash, EMBEDDING_MODEL } from "../lib/chat/embeddings";
import {
  upsertChunk,
  deleteChunkBySource,
  listChunkSources,
} from "../lib/chat/db";
import type {
  DraftChunk,
  KnowledgeSourceType,
  KnowledgeTier,
} from "../lib/chat/types";

// ── Constants ─────────────────────────────────────────────────

const KB_PATH = "public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md";
const PRODUCTS_CSV_PATH = "public/brand/products_export_1 (1).csv";

/** Skip Shopify product handles that are pure tools/accessories with no KB. */
const SKIP_PRODUCT_HANDLES = new Set<string>([
  "bag",
  "fan",
  "lash-wand",
]);

const MAX_BATCH = 64; // OpenAI accepts 2048; keep batches small for safety/visibility.

// ── Args ──────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  prune: boolean;
  only: KnowledgeSourceType | null;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const dryRun = argv.includes("--dry-run");
  const prune = argv.includes("--prune");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const only = (onlyArg?.split("=")[1] ?? null) as CliArgs["only"];
  if (only && !isSourceType(only)) {
    throw new Error(`Invalid --only value: ${only}`);
  }
  return { dryRun, prune, only };
}

function isSourceType(s: string): s is KnowledgeSourceType {
  return [
    "faq_kb",
    "product_md",
    "product_csv",
    "voice_doc",
    "storefront_api",
    "admin_upload",
  ].includes(s);
}

// ── Markdown parsing ──────────────────────────────────────────

/** Strip markdown emphasis and escape characters from a heading line. */
function cleanHeading(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\\\./g, ".")
    .replace(/\\/g, "")
    .trim();
}

/**
 * Parse the FAQ section (§1). Categories are H2 headings; questions are
 * `**Q: ...**` paragraphs followed by `A: ...` paragraphs.
 */
function parseFaqKb(md: string): DraftChunk[] {
  const start = md.indexOf("# **1\\.");
  const end = md.indexOf("# **2\\.");
  if (start === -1 || end === -1) {
    throw new Error("Could not locate FAQ section bounds (§1 → §2)");
  }
  const section = md.slice(start, end);

  const lines = section.split("\n");
  const chunks: DraftChunk[] = [];
  let category = "general";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Category H2: ## **Product Information**
    if (/^## \*\*/.test(line)) {
      category = cleanHeading(line);
      i += 1;
      continue;
    }

    // Question: **Q: ...?**
    const qMatch = line.match(/^\*\*Q: (.+?)\*\*\s*$/);
    if (qMatch) {
      const question = qMatch[1].trim();

      // Find the answer: skip blank lines, collect lines until next blank+Q or H2.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j += 1;
      // Answer paragraphs may continue across blank lines until the next **Q: or ## or # boundary.
      const answerLines: string[] = [];
      let firstAnswerLine = lines[j] ?? "";
      // Strip leading "A: " if present
      firstAnswerLine = firstAnswerLine.replace(/^A:\s*/, "");
      answerLines.push(firstAnswerLine);
      let k = j + 1;
      while (k < lines.length) {
        const next = lines[k];
        if (/^\*\*Q: /.test(next)) break;
        if (/^## /.test(next)) break;
        if (/^# /.test(next)) break;
        answerLines.push(next);
        k += 1;
      }
      const answer = answerLines.join("\n").trim();

      const slug = slugify(question).slice(0, 80);
      chunks.push({
        source_type: "faq_kb",
        source_id: `faq:${slugify(category)}:${slug}`,
        tier: 1,
        title: question,
        content: `Q: ${question}\nA: ${answer}`,
        metadata: { category },
      });
      i = k;
      continue;
    }

    i += 1;
  }
  return chunks;
}

/**
 * Parse the product catalog section (§2). Each product is introduced by a
 * `**Name** *— "Tagline"*` line, followed by description, specs, and price.
 *
 * The Lash Essentials Kit and the per-style entries (Violet, Peony, …) all
 * follow this shape. Sub-section headings like ## **Classic Lashes** are
 * captured as the `volume_class` metadata.
 */
function parseProductMd(md: string): DraftChunk[] {
  const start = md.indexOf("# **2\\.");
  const end = md.indexOf("# **3\\.");
  if (start === -1 || end === -1) {
    throw new Error("Could not locate product catalog bounds (§2 → §3)");
  }
  const section = md.slice(start, end);
  const lines = section.split("\n");

  const chunks: DraftChunk[] = [];
  let volumeClass = "Unknown";

  // Find product header lines: lines that are ONLY a bolded product name
  // followed by a tagline pattern. We look ahead to consume the body.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Track volume_class from ## **Classic Lashes** / **Volume Lashes** / **Coming Soon**
    if (/^## \*\*/.test(line)) {
      volumeClass = cleanHeading(line);
      i += 1;
      continue;
    }

    // Product header: **Name**  *—  "Tagline"*
    const headerMatch = line.match(/^\*\*([^*]+?)\*\*\s+\*—\s+"([^"]+)"\*\s*$/);
    if (headerMatch) {
      const name = headerMatch[1].trim();
      const tagline = headerMatch[2].trim();

      // Skip generic "Retail pricing" rows that look like headers but aren't products.
      if (name.toLowerCase().startsWith("retail pricing")) {
        i += 1;
        continue;
      }

      // Body: collect until the next product header or section heading.
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (/^\*\*([^*]+?)\*\*\s+\*—\s+"([^"]+)"\*\s*$/.test(next)) break;
        if (/^## /.test(next)) break;
        if (/^# /.test(next)) break;
        bodyLines.push(next);
        j += 1;
      }
      const body = bodyLines.join("\n").trim();

      if (body.length === 0) {
        i = j;
        continue;
      }

      const slug = slugify(name);
      const metadata = extractProductSpecs(body);
      metadata.volume_class = volumeClass;
      metadata.tagline = tagline;

      chunks.push({
        source_type: "product_md",
        source_id: `product_md:${slug}`,
        tier: 2,
        title: name,
        content: `${name} — "${tagline}"\n\n${body}`,
        metadata,
      });
      i = j;
      continue;
    }
    i += 1;
  }
  return chunks;
}

/**
 * Parse the brand voice & chatbot personality section (§3) into a small
 * number of stable chunks. We do NOT chunk the never-do rules into retrieval —
 * those live in lib/chat/voice-rules.ts and are enforced in code.
 */
function parseVoiceDoc(md: string): DraftChunk[] {
  const start = md.indexOf("# **3\\.");
  if (start === -1) {
    throw new Error("Could not locate voice section start (§3)");
  }
  const section = md.slice(start).trim();

  // Split on H2 sub-sections.
  const headingRe = /^## \*\*([^*]+)\*\*$/m;
  const lines = section.split("\n");
  const chunks: DraftChunk[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const flush = (): void => {
    if (currentTitle.length === 0) return;
    const body = currentBody.join("\n").trim();
    if (body.length === 0) return;
    chunks.push({
      source_type: "voice_doc",
      source_id: `voice:${slugify(currentTitle)}`,
      tier: 1,
      title: currentTitle,
      content: `${currentTitle}\n\n${body}`,
      metadata: { section: "voice_personality" },
    });
  };

  for (const line of lines) {
    const h = line.match(headingRe);
    if (h) {
      flush();
      currentTitle = h[1].trim();
      currentBody = [];
    } else if (currentTitle.length > 0) {
      currentBody.push(line);
    }
  }
  flush();

  return chunks;
}

function extractProductSpecs(body: string): Record<string, unknown> {
  const specs: Record<string, unknown> = {};
  const specsLine = body.split("\n").find((l) => /Length:/.test(l) && /Wear:/.test(l));
  if (specsLine) {
    const parts = specsLine.split("|").map((p) => p.trim());
    for (const part of parts) {
      const [k, v] = part.split(":").map((s) => s.trim());
      if (k && v) specs[k.toLowerCase()] = v;
    }
  }
  const priceMatch = body.match(/\*\*Retail:\s*([^*]+)\*\*/);
  if (priceMatch) specs.retail = priceMatch[1].trim();
  const includesMatch = body.match(/Includes:\s*([^|\n]+)/);
  if (includesMatch) specs.includes = includesMatch[1].trim();
  return specs;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// ── CSV parsing ───────────────────────────────────────────────

/**
 * Minimal CSV parser that handles quoted fields, escaped quotes (""), and
 * embedded newlines/commas inside quotes. Sufficient for Shopify exports.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      current.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface CsvProductBuilder {
  handle: string;
  title: string;
  body: string;
  tags: string;
  vendor: string;
  type: string;
  prices: Set<string>;
  metafields: Record<string, string>;
}

/**
 * Group Shopify CSV rows by Handle and emit one chunk per product. Skips
 * known accessory-only handles per SKIP_PRODUCT_HANDLES.
 */
function parseProductsCsv(csvText: string): DraftChunk[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return [];
  const header = rows[0];

  const idx = (name: string): number => header.indexOf(name);
  const HANDLE = idx("Handle");
  const TITLE = idx("Title");
  const BODY = idx("Body (HTML)");
  const TAGS = idx("Tags");
  const VENDOR = idx("Vendor");
  const TYPE = idx("Type");
  const VARIANT_PRICE = idx("Variant Price");

  if (HANDLE < 0 || TITLE < 0) {
    throw new Error("Products CSV missing Handle or Title column");
  }

  // Metafield columns (best-effort detection)
  const META_COLS: Array<{ key: string; col: number }> = [
    { key: "curl", col: idx("Curl (product.metafields.custom.curl)") },
    { key: "length", col: idx("Length (product.metafields.custom.length)") },
    { key: "shape", col: idx("Shape (product.metafields.custom.shape)") },
    { key: "volume", col: idx("Volume (product.metafields.custom.volume)") },
    {
      key: "eyelash_material",
      col: idx("Eyelash material (product.metafields.shopify.eyelash-material)"),
    },
    {
      key: "color",
      col: idx("Color (product.metafields.shopify.color-pattern)"),
    },
  ].filter((m) => m.col >= 0);

  const builders = new Map<string, CsvProductBuilder>();

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.length === 0) continue;
    const handle = row[HANDLE]?.trim();
    if (!handle) continue;
    if (SKIP_PRODUCT_HANDLES.has(handle)) continue;

    let b = builders.get(handle);
    if (!b) {
      b = {
        handle,
        title: row[TITLE]?.trim() ?? handle,
        body: stripHtml(row[BODY] ?? ""),
        tags: row[TAGS]?.trim() ?? "",
        vendor: row[VENDOR]?.trim() ?? "",
        type: row[TYPE]?.trim() ?? "",
        prices: new Set<string>(),
        metafields: {},
      };
      // Capture metafields from the first row only (Shopify pattern).
      for (const m of META_COLS) {
        const v = row[m.col]?.trim();
        if (v) b.metafields[m.key] = v;
      }
      builders.set(handle, b);
    }

    const price = VARIANT_PRICE >= 0 ? row[VARIANT_PRICE]?.trim() : undefined;
    if (price && /^\d/.test(price)) b.prices.add(price);
  }

  const chunks: DraftChunk[] = [];
  for (const b of builders.values()) {
    // Build content
    const priceList = [...b.prices].sort((a, z) => Number(a) - Number(z));
    const contentParts = [
      b.title,
      b.type ? `Type: ${b.type}` : "",
      b.vendor ? `Vendor: ${b.vendor}` : "",
      b.tags ? `Tags: ${b.tags}` : "",
      priceList.length > 0 ? `Variant prices (USD): ${priceList.join(", ")}` : "",
      Object.keys(b.metafields).length > 0
        ? Object.entries(b.metafields)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ")
        : "",
      b.body ? `Description: ${b.body}` : "",
      `Product page: cocolash.com/products/${b.handle}`,
    ].filter((p) => p.length > 0);

    const content = contentParts.join("\n");

    chunks.push({
      source_type: "product_csv",
      source_id: `product_csv:${b.handle}`,
      tier: 2,
      title: b.title,
      content,
      metadata: {
        handle: b.handle,
        type: b.type,
        prices: priceList,
        ...b.metafields,
      },
    });
  }

  return chunks;
}

// ── Embed + upsert ────────────────────────────────────────────

interface IngestReport {
  inserted: number;
  updated: number;
  unchanged: number;
  pruned: number;
  skipped: number;
  bySourceType: Record<string, number>;
}

async function ingestChunks(
  supabase: SupabaseClient,
  drafts: ReadonlyArray<DraftChunk>,
  args: CliArgs,
  report: IngestReport
): Promise<void> {
  // Pre-compute hashes
  const withHash = await Promise.all(
    drafts.map(async (d) => ({
      draft: d,
      hash: await contentHash(d.content),
    }))
  );

  // Determine which need re-embedding by comparing hashes against existing rows.
  // We do that inside upsertChunk (returns "unchanged" if hash matches existing).
  // For efficiency, embed only for non-unchanged rows. But upsertChunk wants
  // the embedding upfront; so we batch: first split into "needs embedding".

  // Fetch existing source_ids → content_hash to skip embedding for unchanged.
  type Existing = { source_type: string; source_id: string; content_hash: string };
  const { data: existing, error: exErr } = await supabase
    .from("knowledge_chunks")
    .select("source_type, source_id, content_hash");
  const existingMap = new Map<string, string>();
  if (exErr) {
    if (args.dryRun) {
      process.stdout.write(
        `[dry-run] Could not fetch existing chunks (${exErr.message}). Reporting all drafts as new.\n`
      );
    } else {
      throw new Error(`Failed to fetch existing chunks: ${exErr.message}`);
    }
  } else {
    for (const e of (existing ?? []) as Existing[]) {
      existingMap.set(`${e.source_type}|${e.source_id}`, e.content_hash);
    }
  }

  const toEmbed: typeof withHash = [];
  const unchangedRefs: typeof withHash = [];

  for (const item of withHash) {
    const key = `${item.draft.source_type}|${item.draft.source_id}`;
    const existingHash = existingMap.get(key);
    if (existingHash === item.hash) {
      unchangedRefs.push(item);
    } else {
      toEmbed.push(item);
    }
  }

  report.unchanged += unchangedRefs.length;

  if (args.dryRun) {
    process.stdout.write(
      `[dry-run] Would embed ${toEmbed.length} chunks (${unchangedRefs.length} unchanged).\n`
    );
    for (const item of toEmbed) {
      report.bySourceType[item.draft.source_type] =
        (report.bySourceType[item.draft.source_type] ?? 0) + 1;
    }
    return;
  }

  // Embed in batches.
  for (let i = 0; i < toEmbed.length; i += MAX_BATCH) {
    const batch = toEmbed.slice(i, i + MAX_BATCH);
    const vectors = await embedMany(batch.map((b) => b.draft.content));
    for (let j = 0; j < batch.length; j += 1) {
      const item = batch[j];
      const vector = vectors[j];
      const result = await upsertChunk(supabase, {
        ...item.draft,
        content_hash: item.hash,
        embedding: vector,
        embedding_model: EMBEDDING_MODEL,
      });
      if (result.action === "inserted") report.inserted += 1;
      else if (result.action === "updated") report.updated += 1;
      else report.unchanged += 1;
      report.bySourceType[item.draft.source_type] =
        (report.bySourceType[item.draft.source_type] ?? 0) + 1;
    }
    process.stdout.write(
      `Embedded + upserted ${Math.min(i + batch.length, toEmbed.length)}/${toEmbed.length}\n`
    );
  }
}

async function pruneStale(
  supabase: SupabaseClient,
  drafts: ReadonlyArray<DraftChunk>,
  managedTypes: ReadonlySet<KnowledgeSourceType>,
  report: IngestReport
): Promise<void> {
  const desired = new Set(
    drafts.map((d) => `${d.source_type}|${d.source_id}`)
  );
  const existing = await listChunkSources(supabase);
  for (const e of existing) {
    if (!managedTypes.has(e.source_type as KnowledgeSourceType)) continue;
    const key = `${e.source_type}|${e.source_id}`;
    if (!desired.has(key)) {
      await deleteChunkBySource(
        supabase,
        e.source_type as KnowledgeSourceType,
        e.source_id
      );
      report.pruned += 1;
      process.stdout.write(`Pruned: ${key}\n`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const repoRoot = path.resolve(__dirname, "..");
  const kbMd = readFileSync(path.join(repoRoot, KB_PATH), "utf-8");
  const csvText = readFileSync(path.join(repoRoot, PRODUCTS_CSV_PATH), "utf-8");

  // Parse all sources first; we may filter by --only later.
  const allDrafts: DraftChunk[] = [
    ...parseFaqKb(kbMd),
    ...parseProductMd(kbMd),
    ...parseVoiceDoc(kbMd),
    ...parseProductsCsv(csvText),
  ];

  const drafts = args.only
    ? allDrafts.filter((d) => d.source_type === args.only)
    : allDrafts;

  // Per-type breakdown
  const breakdown: Record<KnowledgeSourceType, number> = {
    faq_kb: 0,
    product_md: 0,
    product_csv: 0,
    voice_doc: 0,
    storefront_api: 0,
    admin_upload: 0,
  };
  for (const d of drafts) breakdown[d.source_type] += 1;

  process.stdout.write(`\n[chat-ingest] CocoLash knowledge ingest\n`);
  process.stdout.write(`Repo:     ${repoRoot}\n`);
  process.stdout.write(`Mode:     ${args.dryRun ? "DRY RUN" : "live"}${args.prune ? " + prune" : ""}\n`);
  process.stdout.write(`Filter:   ${args.only ?? "(all)"}\n`);
  process.stdout.write(`Drafts:   ${drafts.length}\n`);
  for (const [k, v] of Object.entries(breakdown)) {
    if (v > 0) process.stdout.write(`  ${k.padEnd(16)} ${v}\n`);
  }

  // Validate before doing any DB or network work.
  if (drafts.length === 0) {
    process.stdout.write("\nNothing to ingest. Exiting.\n");
    return;
  }
  if (drafts.length < 60 && !args.only) {
    process.stdout.write(
      `\n⚠ Expected at least 60 chunks across all sources; got ${drafts.length}. Continuing anyway.\n`
    );
  }

  const report: IngestReport = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    pruned: 0,
    skipped: 0,
    bySourceType: {},
  };

  // Connect to Supabase only when not pure-dry-run (still needed to read existing hashes).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    if (args.dryRun) {
      process.stdout.write(
        `\n[dry-run] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping DB hash diff. Will report all drafts as new.\n`
      );
      report.inserted = drafts.length;
      printReport(report);
      return;
    }
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  await ingestChunks(supabase, drafts, args, report);

  if (args.prune) {
    const managedTypes = new Set<KnowledgeSourceType>(
      args.only ? [args.only] : ["faq_kb", "product_md", "voice_doc", "product_csv"]
    );
    await pruneStale(supabase, drafts, managedTypes, report);
  }

  printReport(report);
}

function printReport(report: IngestReport): void {
  process.stdout.write(`\n── Ingest report ──\n`);
  process.stdout.write(`Inserted:  ${report.inserted}\n`);
  process.stdout.write(`Updated:   ${report.updated}\n`);
  process.stdout.write(`Unchanged: ${report.unchanged}\n`);
  process.stdout.write(`Pruned:    ${report.pruned}\n`);
  process.stdout.write(`Skipped:   ${report.skipped}\n`);
  if (Object.keys(report.bySourceType).length > 0) {
    process.stdout.write(`By source type:\n`);
    for (const [k, v] of Object.entries(report.bySourceType)) {
      process.stdout.write(`  ${k.padEnd(16)} ${v}\n`);
    }
  }
  process.stdout.write(`\nDone.\n`);
}

// Tiers explicitly enumerated above so the type checker can confirm tier
// values are valid against KnowledgeTier even after refactors.
void (1 as KnowledgeTier);

main().catch((err) => {
  process.stderr.write(`\n[chat-ingest] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
