/**
 * scripts/chat-eval.ts — Eval runner for the milestone v3.0 chatbot.
 *
 * For each question in lib/chat/eval/gold-questions.ts:
 *   1. Embed the question.
 *   2. Retrieve top-K chunks (uses production lib/chat/retrieve.ts).
 *   3. Compute retrieval@K hit rate (any of expected_chunk_ids in top-K).
 *   4. Run the full chat pipeline (composeSystemPrompt → streamChat).
 *   5. Check `must_contain` / `must_not_contain` and `expected_intent`.
 *
 * Aggregates pass / fail vs. ROADMAP.md thresholds:
 *   retrieval@6 >= 0.9
 *   must_contain_pass_rate >= 0.85
 *   must_not_contain_pass_rate == 1.0
 *
 * Writes JSON results to eval/results/eval-YYYY-MM-DD-HHMMSS.json.
 *
 * Usage:
 *   npx tsx scripts/chat-eval.ts                # full run (needs deploy + keys)
 *   npx tsx scripts/chat-eval.ts --dry-run      # parse + report cost only
 *   npx tsx scripts/chat-eval.ts --limit=5      # first N questions
 *   npx tsx scripts/chat-eval.ts --intent-only  # skip the chat call
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GOLD_QUESTIONS, GOLD_QUESTIONS_COUNT, type GoldQuestion } from "../lib/chat/eval/gold-questions";
import { retrieve } from "../lib/chat/retrieve";
import { classifyIntent } from "../lib/chat/intent";
import { composeSystemPrompt, DEFAULT_VOICE_FRAGMENTS } from "../lib/chat/voice";
import { isBusinessHours } from "../lib/chat/hours";
import { streamChat } from "../lib/openrouter/chat";
import type { IntentLabel } from "../lib/chat/types";

interface CliArgs {
  dryRun: boolean;
  intentOnly: boolean;
  limit: number | null;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const dryRun = argv.includes("--dry-run");
  const intentOnly = argv.includes("--intent-only");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
  return { dryRun, intentOnly, limit };
}

interface QuestionResult {
  id: string;
  question: string;
  expected_topic: string;
  retrieved_chunk_ids: string[];
  retrieved_distances: number[];
  retrieval_hit: boolean;
  no_confident_match: boolean;
  intent_predicted: IntentLabel | null;
  intent_expected: IntentLabel | null;
  intent_match: boolean | null;
  answer: string | null;
  must_contain_pass: boolean | null;
  must_not_contain_pass: boolean | null;
  latency_ms: number;
}

interface EvalSummary {
  startedAt: string;
  finishedAt: string;
  totalQuestions: number;
  retrievalHitRate: number;
  mustContainPassRate: number;
  mustNotContainPassRate: number;
  intentAccuracy: number | null;
  thresholds: {
    retrievalK: number;
    mustContainK: number;
    mustNotContainK: number;
  };
  pass: boolean;
  results: QuestionResult[];
}

const THRESHOLDS = {
  retrievalK: 0.9,
  mustContainK: 0.85,
  mustNotContainK: 1.0,
};

async function evaluate(question: GoldQuestion, args: CliArgs, supabase: SupabaseClient | null): Promise<QuestionResult> {
  const startTs = Date.now();

  // Sanity assert: gold rows live in source so type narrows always.
  if (!question.id) throw new Error("Gold row missing id");

  let retrieved_chunk_ids: string[] = [];
  let retrieved_distances: number[] = [];
  let no_confident_match = false;
  let retrieval_hit = false;

  if (supabase) {
    const r = await retrieve(supabase, question.question);
    retrieved_chunk_ids = r.chunks.map((c) => c.source_id);
    retrieved_distances = r.chunks.map((c) => c.distance);
    no_confident_match = r.noConfidentMatch;
    retrieval_hit =
      question.expected_chunk_ids.length === 0
        ? no_confident_match // out-of-scope rows: hit if we correctly bail
        : question.expected_chunk_ids.some((id) =>
            retrieved_chunk_ids.includes(id)
          );
  }

  // Intent classification.
  const intent_expected = question.expected_intent ?? null;
  const intent = await classifyIntent(question.question);
  const intent_predicted = intent.intent;
  const intent_match =
    intent_expected === null ? null : intent_expected === intent_predicted;

  if (args.intentOnly || !supabase) {
    return {
      id: question.id,
      question: question.question,
      expected_topic: question.expected_topic,
      retrieved_chunk_ids,
      retrieved_distances,
      retrieval_hit,
      no_confident_match,
      intent_predicted,
      intent_expected,
      intent_match,
      answer: null,
      must_contain_pass: null,
      must_not_contain_pass: null,
      latency_ms: Date.now() - startTs,
    };
  }

  // Full chat run.
  const r = await retrieve(supabase, question.question);
  const systemPrompt = composeSystemPrompt({
    fragments: DEFAULT_VOICE_FRAGMENTS,
    retrievedChunks: r.noConfidentMatch ? [] : r.chunks,
    isBusinessHours: isBusinessHours(),
  });
  const { tokens, done } = streamChat({
    systemPrompt,
    history: [{ role: "user", content: question.question }],
  });
  const accum: string[] = [];
  for await (const t of tokens) accum.push(t);
  await done;
  const answer = accum.join("");

  const lowerAnswer = answer.toLowerCase();
  const must_contain_pass =
    question.must_contain.length === 0 ||
    question.must_contain.every((s) => lowerAnswer.includes(s.toLowerCase()));
  const must_not_contain_pass = question.must_not_contain.every(
    (s) => !lowerAnswer.includes(s.toLowerCase())
  );

  return {
    id: question.id,
    question: question.question,
    expected_topic: question.expected_topic,
    retrieved_chunk_ids,
    retrieved_distances,
    retrieval_hit,
    no_confident_match,
    intent_predicted,
    intent_expected,
    intent_match,
    answer,
    must_contain_pass,
    must_not_contain_pass,
    latency_ms: Date.now() - startTs,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const all = args.limit ? GOLD_QUESTIONS.slice(0, args.limit) : GOLD_QUESTIONS;

  process.stdout.write(`\n[chat-eval] gold set: ${GOLD_QUESTIONS_COUNT} questions\n`);
  process.stdout.write(`Mode: ${args.dryRun ? "DRY RUN" : args.intentOnly ? "INTENT ONLY" : "FULL"}\n`);
  process.stdout.write(`Running: ${all.length}\n`);

  if (args.dryRun) {
    // Cost estimate (very rough):
    //   retrieval embeddings: 50 * ~30 tok ~ $0.00003
    //   intent classification: 50 * ~200 tok in / 5 out via Haiku ~ $0.001
    //   chat completions: 50 * ~1500 tok in / 200 tok out via Sonnet ~ $0.40
    process.stdout.write(`Estimated full-run cost: ~$0.40 (Sonnet) + ~$0.001 (Haiku) + ~$0.00003 (embeddings)\n`);
    process.stdout.write(`No API calls made.\nDone.\n`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  if (!supabase && !args.intentOnly) {
    process.stderr.write(
      "\n[chat-eval] Missing Supabase credentials in .env.local. Use --intent-only or set keys.\n"
    );
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const results: QuestionResult[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const q = all[i];
    process.stdout.write(`[${i + 1}/${all.length}] ${q.id} — ${q.question}\n`);
    try {
      const r = await evaluate(q, args, supabase);
      results.push(r);
      const flags = [
        r.retrieval_hit ? "ret✓" : "ret✗",
        r.intent_match === true ? "int✓" : r.intent_match === false ? "int✗" : "int–",
        r.must_contain_pass === true ? "mc✓" : r.must_contain_pass === false ? "mc✗" : "mc–",
        r.must_not_contain_pass === true ? "vio✓" : r.must_not_contain_pass === false ? "vio✗" : "vio–",
      ].join(" ");
      process.stdout.write(`     ${flags} (${r.latency_ms}ms)\n`);
    } catch (err) {
      process.stderr.write(`     FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  const finishedAt = new Date().toISOString();

  // Aggregate.
  const retrievalHitRate = results.filter((r) => r.retrieval_hit).length / results.length;
  const intentRows = results.filter((r) => r.intent_match !== null);
  const intentAccuracy = intentRows.length > 0
    ? intentRows.filter((r) => r.intent_match === true).length / intentRows.length
    : null;
  const mcRows = results.filter((r) => r.must_contain_pass !== null);
  const mustContainPassRate = mcRows.length > 0
    ? mcRows.filter((r) => r.must_contain_pass === true).length / mcRows.length
    : 0;
  const vRows = results.filter((r) => r.must_not_contain_pass !== null);
  const mustNotContainPassRate = vRows.length > 0
    ? vRows.filter((r) => r.must_not_contain_pass === true).length / vRows.length
    : 0;

  const pass =
    retrievalHitRate >= THRESHOLDS.retrievalK &&
    mustContainPassRate >= THRESHOLDS.mustContainK &&
    mustNotContainPassRate >= THRESHOLDS.mustNotContainK;

  const summary: EvalSummary = {
    startedAt,
    finishedAt,
    totalQuestions: results.length,
    retrievalHitRate,
    mustContainPassRate,
    mustNotContainPassRate,
    intentAccuracy,
    thresholds: THRESHOLDS,
    pass,
    results,
  };

  // Write report.
  const repoRoot = path.resolve(__dirname, "..");
  const dir = path.join(repoRoot, "eval", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `eval-${stamp}.json`);
  writeFileSync(file, JSON.stringify(summary, null, 2));

  process.stdout.write(`\n── Eval summary ──\n`);
  process.stdout.write(`Retrieval hit rate:   ${(retrievalHitRate * 100).toFixed(1)}% (target ≥ ${(THRESHOLDS.retrievalK * 100).toFixed(0)}%)\n`);
  process.stdout.write(`must_contain pass:    ${(mustContainPassRate * 100).toFixed(1)}% (target ≥ ${(THRESHOLDS.mustContainK * 100).toFixed(0)}%)\n`);
  process.stdout.write(`must_not_contain:     ${(mustNotContainPassRate * 100).toFixed(1)}% (target = ${(THRESHOLDS.mustNotContainK * 100).toFixed(0)}%)\n`);
  if (intentAccuracy !== null) {
    process.stdout.write(`Intent accuracy:      ${(intentAccuracy * 100).toFixed(1)}%\n`);
  }
  process.stdout.write(`Overall:              ${pass ? "PASS" : "FAIL"}\n`);
  process.stdout.write(`Report:               ${file}\n\n`);

  if (!pass) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`\n[chat-eval] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
