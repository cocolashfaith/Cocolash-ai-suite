#!/usr/bin/env node
/**
 * Asserts the built widget bundle is under the gzipped budget.
 *
 * Budget: 50,000 bytes (decision D-02 in 03-CONTEXT.md).
 *
 * Reads <repo-root>/public/widget.js, gzips with Node's zlib, and exits
 * non-zero if the result exceeds the budget. CI fails the build.
 */

import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const BUDGET_BYTES = 50_000;
const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const bundle = path.join(repoRoot, "public", "widget.js");

let stat;
try {
  stat = statSync(bundle);
} catch {
  console.error(`✗ widget bundle missing: ${bundle}`);
  process.exit(2);
}

const raw = readFileSync(bundle);
const gz = gzipSync(raw);

const rawKb = (stat.size / 1024).toFixed(2);
const gzKb = (gz.length / 1024).toFixed(2);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(2);

console.log(`widget.js: ${rawKb} KB raw / ${gzKb} KB gzipped (budget ${budgetKb} KB)`);

if (gz.length > BUDGET_BYTES) {
  console.error(
    `✗ Bundle exceeds gzipped budget by ${gz.length - BUDGET_BYTES} bytes. Trim deps or split code.`
  );
  process.exit(1);
}

console.log("✓ Bundle is within budget.");
