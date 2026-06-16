#!/usr/bin/env node
/**
 * HeyGen Avatar V eligibility probe (Phase 35, Wave 0).
 *
 * Answers the make-or-break question: does a FRESH photo avatar created from
 * a CocoLash-style composed image advertise Avatar V in `supported_api_engines`?
 * If it doesn't, the per-video photo-avatar pipeline can't use Avatar V as-is and
 * we fall back to Avatar IV (the code already does this gracefully).
 *
 * Usage:
 *   node scripts/heygen-avatar-v-probe.mjs <publicly-accessible-person-image-url>
 *
 * Cost: creates one throwaway photo avatar on your HeyGen account (NOT a paid
 * video render). Reads HEYGEN_API_KEY from .env.local.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadApiKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  try {
    const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("HEYGEN_API_KEY="));
    if (line) return line.slice("HEYGEN_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* fall through */
  }
  throw new Error("HEYGEN_API_KEY not found (env or .env.local)");
}

const API_BASE = "https://api.heygen.com";

async function main() {
  const imageUrl = process.argv[2];
  if (!imageUrl) {
    console.error("Usage: node scripts/heygen-avatar-v-probe.mjs <person-image-url>");
    process.exit(1);
  }
  const apiKey = loadApiKey();
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" };

  console.log(`→ Creating photo avatar from: ${imageUrl}`);
  const createRes = await fetch(`${API_BASE}/v3/avatars`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "photo", name: "CocoLash Avatar V probe", file: { type: "url", url: imageUrl } }),
  });
  const createBody = await createRes.json();
  if (!createRes.ok) {
    console.error("✗ Create failed:", createRes.status, JSON.stringify(createBody));
    process.exit(1);
  }
  const item = createBody?.data?.avatar_item ?? {};
  const lookId = item.id;
  console.log(`✓ Look id: ${lookId}`);
  console.log(`  avatar_type: ${item.avatar_type}`);
  console.log(`  supported_api_engines (at create): ${JSON.stringify(item.supported_api_engines ?? [])}`);

  // Re-check the look a few times in case engine metadata populates after processing.
  let engines = item.supported_api_engines ?? [];
  for (let i = 0; i < 6 && !engines.some((e) => String(e).toLowerCase().includes("avatar_v")); i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const lookRes = await fetch(`${API_BASE}/v3/avatars/looks/${encodeURIComponent(lookId)}`, { headers });
    if (!lookRes.ok) break;
    const lookBody = await lookRes.json();
    engines = lookBody?.data?.supported_api_engines ?? lookBody?.supported_api_engines ?? engines;
    console.log(`  …re-check ${i + 1}: ${JSON.stringify(engines)}`);
  }

  const eligible = engines.some((e) => String(e).toLowerCase().includes("avatar_v"));
  console.log("\n──────── VERDICT ────────");
  console.log(eligible
    ? "✅ Avatar V IS available for fresh photo avatars — the quality upgrade applies."
    : "⚠️  Avatar V NOT listed for this look — pipeline will fall back to Avatar IV. See 35-PLAN.md Wave 0 fallback options.");
  console.log(`   supported_api_engines = ${JSON.stringify(engines)}`);
}

main().catch((err) => {
  console.error("Probe error:", err.message);
  process.exit(1);
});
