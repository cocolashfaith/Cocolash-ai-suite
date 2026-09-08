/**
 * scripts/smoke-seedance25.ts — ONE real Seedance 2.5 run through OUR pipeline.
 *
 * Unlike poc/seedance25-ugc.ts (which calls Enhancor directly), this drives the
 * shipped app end to end: log in with AUTH_PASSWORD → POST /api/seedance/generate
 * with engine "2.5" → poll GET /api/seedance/{id}/status until the row completes
 * → print credits_cost / processing_cost / final_video_url.
 *
 * The webhook cannot reach localhost, so status polling is what completes the
 * row (the status route polls Enhancor and writes the cost back).
 *
 * THIS SPENDS REAL MONEY. Default 480p x 4 s = 122.2 x 4 = 488.8 credits (~$0.49).
 * A --rerender pass adds a 1080p job at the same duration (~$1.95 at 4 s).
 * The script refuses to run without the explicit --i-accept-cost flag.
 *
 * Usage:
 *   npx tsx scripts/smoke-seedance25.ts --dry-run
 *   npx tsx scripts/smoke-seedance25.ts --i-accept-cost
 *   npx tsx scripts/smoke-seedance25.ts --i-accept-cost --base https://cocolash-ai-suite.vercel.app
 *   npx tsx scripts/smoke-seedance25.ts --i-accept-cost --resolution 720p --duration 6 --rerender
 *
 * Flags:
 *   --dry-run          Print the exact request body and exit. No login, no cost.
 *   --i-accept-cost    Required for a real run (ignored with --dry-run).
 *   --base <url>       App base URL (default http://localhost:3000).
 *   --resolution <r>   480p | 720p | 1080p (default 480p).
 *   --duration <n>     4-30 seconds, or -1 for Auto (default 4).
 *   --rerender         After completion, also submit the 1080p "Final" re-render.
 */
import { config } from "dotenv";

import {
  SEEDANCE_25_LIMITS,
  AUTO_DURATION,
  type Seedance25Resolution,
} from "../lib/seedance/v25/types";
import { resolutionToQualityTier } from "../lib/seedance/engines";

config({ path: ".env.local" });

// ── The POC's proven inputs (real CocoLash assets) ────────────
const PRODUCT_URL =
  "https://cdn.shopify.com/s/files/1/0660/8646/9831/files/dahlia-915557.jpg?v=1768316695";
const INFLUENCER_URL =
  "https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/generated-images/cocolash/1f59685f-4fad-4bd0-809d-98f89dd0d715-studio-avatar.jpg";

const PROMPT =
  "Handheld vertical UGC selfie video. A young woman with radiant skin and long, " +
  "fluttery lashes sits at a cozy, softly lit vanity. She smiles warmly at the camera, " +
  "holds up the CocoLash Dahlia lash kit so the packaging is clearly visible, then lightly " +
  "touches the outer corner of her eye to show off her lashes. Natural, candid, authentic " +
  "influencer energy, not overly polished. Soft natural daylight, shallow depth of field, " +
  "gentle handheld motion. She looks genuinely excited to share her favorite at-home lashes.";

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

const RESOLUTIONS: Seedance25Resolution[] = ["480p", "720p", "1080p"];

interface Options {
  base: string;
  resolution: Seedance25Resolution;
  duration: number;
  rerender: boolean;
  dryRun: boolean;
  accepted: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    base: "http://localhost:3000",
    resolution: "480p",
    duration: 4,
    rerender: false,
    dryRun: false,
    accepted: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--base":
        opts.base = next().replace(/\/+$/, "");
        break;
      case "--resolution": {
        const v = next() as Seedance25Resolution;
        if (!RESOLUTIONS.includes(v)) {
          throw new Error(`--resolution must be one of ${RESOLUTIONS.join(", ")} (got ${v})`);
        }
        opts.resolution = v;
        break;
      }
      case "--duration": {
        const v = Number(next());
        const ok =
          v === AUTO_DURATION ||
          (Number.isInteger(v) &&
            v >= SEEDANCE_25_LIMITS.durationMin &&
            v <= SEEDANCE_25_LIMITS.durationMax);
        if (!ok) {
          throw new Error(
            `--duration must be ${SEEDANCE_25_LIMITS.durationMin}-${SEEDANCE_25_LIMITS.durationMax} or ${AUTO_DURATION} (Auto), got ${v}`
          );
        }
        opts.duration = v;
        break;
      }
      case "--rerender":
        opts.rerender = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--i-accept-cost":
        opts.accepted = true;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
}

/** The exact POST /api/seedance/generate body (Seedance25GenerateBodySchema input). */
function buildGenerateBody(opts: Options) {
  return {
    engine: "2.5" as const,
    qualityTier: resolutionToQualityTier(opts.resolution),
    campaignType: "product-showcase",
    tone: "casual",
    productSku: "dahlia",
    request: {
      mode: "ugc" as const,
      prompt: PROMPT,
      duration: opts.duration,
      resolution: opts.resolution,
      aspect_ratio: "9:16" as const,
      products: [PRODUCT_URL],
      influencers: [INFLUENCER_URL],
      pass_faces: true,
      is_uncensored: false,
      bitrate_mode: "standard" as const,
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST /api/auth with AUTH_PASSWORD; returns the `cocolash-auth` cookie header. */
async function login(base: string): Promise<string> {
  const password = process.env.AUTH_PASSWORD;
  if (!password) throw new Error("AUTH_PASSWORD is not set (expected in .env.local)");

  const res = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = setCookie.find((c) => c.startsWith("cocolash-auth="));
  if (!raw) throw new Error("Login succeeded but no cocolash-auth cookie was set");
  return raw.split(";")[0];
}

interface GenerateResponse {
  videoId: string;
  taskId: string;
  status: string;
  engine: string;
  estimatedCost: number;
  estimate: {
    credits: number;
    usd: number;
    billableSeconds: number;
    rateKind: string;
    assumedAutoDuration: boolean;
    note: string;
  };
}

async function postJson<T>(
  url: string,
  cookie: string,
  body: unknown
): Promise<{ status: number; json: T | { error?: string; code?: string } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 300) };
  }
  return { status: res.status, json: json as T };
}

interface StatusResponse {
  videoId: string;
  status: string;
  progress?: number;
  finalVideoUrl?: string;
  creditsCost?: number | null;
  costUsd?: number | null;
  errorMessage?: string | null;
  error?: string;
}

/** Poll every 15 s for up to 15 min; the webhook can't reach localhost. */
async function pollUntilDone(
  base: string,
  cookie: string,
  videoId: string
): Promise<StatusResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = "";

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(`${base}/api/seedance/${videoId}/status`, {
      headers: { cookie },
      redirect: "manual",
    });
    const status = (await res.json()) as StatusResponse;
    const line = `${status.status}${status.progress != null ? ` ${status.progress}%` : ""}`;
    if (line !== last) {
      console.log(`  [${new Date().toISOString().slice(11, 19)}] ${line}`);
      last = line;
    }
    if (status.status === "completed" || status.status === "failed") return status;
  }
  throw new Error(`Timed out after ${POLL_TIMEOUT_MS / 60_000} min waiting for ${videoId}`);
}

function report(label: string, status: StatusResponse): void {
  console.log(`\n── ${label} ──`);
  console.log(`  status           ${status.status}`);
  console.log(`  credits_cost     ${status.creditsCost ?? "(null)"}`);
  console.log(`  processing_cost  ${status.costUsd ?? "(null)"}`);
  console.log(`  final_video_url  ${status.finalVideoUrl ?? "(null)"}`);
  if (status.errorMessage) console.log(`  error_message    ${status.errorMessage}`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const body = buildGenerateBody(opts);

  if (opts.dryRun) {
    console.log("DRY RUN — nothing is sent, no cost incurred.");
    console.log(`POST ${opts.base}/api/seedance/generate`);
    console.log(JSON.stringify(body, null, 2));
    if (opts.rerender) {
      console.log(`\nThen POST ${opts.base}/api/seedance/{videoId}/rerender`);
      console.log(JSON.stringify({ duration: opts.duration }, null, 2));
    }
    return;
  }

  if (!opts.accepted) {
    console.error(
      "Refusing to run: this submits a REAL Seedance 2.5 job and spends real credits.\n" +
        "  480p x 4 s ~ 488.8 credits (~$0.49); 1080p x 4 s ~ 1949 credits (~$1.95).\n" +
        "Re-run with --i-accept-cost, or use --dry-run to see the request body."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Base:       ${opts.base}`);
  console.log(`Resolution: ${opts.resolution}  Duration: ${opts.duration}`);

  const cookie = await login(opts.base);
  console.log("Logged in (cocolash-auth cookie obtained).");

  const gen = await postJson<GenerateResponse>(`${opts.base}/api/seedance/generate`, cookie, body);
  if (gen.status !== 200) {
    const err = gen.json as { error?: string; code?: string };
    console.error(`generate failed (${gen.status}): ${err.code ?? ""} ${err.error ?? ""}`);
    process.exitCode = 1;
    return;
  }

  const created = gen.json as GenerateResponse;
  console.log(
    `Queued ${created.videoId} (task ${created.taskId}) — estimate ${created.estimate.credits} credits / $${created.estimate.usd}`
  );

  const done = await pollUntilDone(opts.base, cookie, created.videoId);
  report(`Draft ${opts.resolution} x ${opts.duration}s`, done);

  if (done.status === "failed") {
    process.exitCode = 1;
    return;
  }

  if (!opts.rerender) {
    console.log("\n(--rerender not set; the 1080p Final re-render was NOT submitted.)");
    return;
  }

  console.log("\nSubmitting 1080p re-render…");
  const re = await postJson<GenerateResponse & { rerenderOf: string }>(
    `${opts.base}/api/seedance/${created.videoId}/rerender`,
    cookie,
    { duration: opts.duration }
  );
  if (re.status !== 200) {
    const err = re.json as { error?: string; code?: string };
    console.error(`rerender failed (${re.status}): ${err.code ?? ""} ${err.error ?? ""}`);
    process.exitCode = 1;
    return;
  }
  const reCreated = re.json as GenerateResponse & { rerenderOf: string };
  console.log(
    `Queued ${reCreated.videoId} (rerender of ${reCreated.rerenderOf}) — estimate ${reCreated.estimate.credits} credits / $${reCreated.estimate.usd}`
  );
  report("Final 1080p", await pollUntilDone(opts.base, cookie, reCreated.videoId));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
