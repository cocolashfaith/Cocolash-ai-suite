import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { listVoices } from "@/lib/heygen/client";
import { HeyGenError } from "@/lib/heygen/types";
import type { VoiceOption } from "@/lib/types";

const CACHE_TTL_DAYS = 7;

/**
 * GET /api/voices
 *
 * Returns available HeyGen voices for the video generation wizard.
 * Caches voices in the `voice_options` table with a 7-day TTL.
 * On first call (or after TTL expiry), fetches fresh data from HeyGen
 * and upserts into the cache.
 */
export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data: cachedVoices, error: cacheError } = await supabase
      .from("voice_options")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (cacheError) {
      console.error("[voices] Cache read error:", cacheError);
    }

    const typed = (cachedVoices ?? []) as VoiceOption[];

    if (typed.length > 0 && !isCacheStale(typed)) {
      return NextResponse.json({ voices: typed, source: "cache" });
    }

    let freshVoices;
    try {
      freshVoices = await listVoices();
    } catch (error) {
      if (typed.length > 0) {
        console.warn("[voices] HeyGen fetch failed, returning stale cache");
        return NextResponse.json({ voices: typed, source: "stale_cache" });
      }

      if (error instanceof HeyGenError && error.statusCode === 500) {
        return NextResponse.json(
          {
            error: "HeyGen API is temporarily unavailable",
            voices: [],
          },
          { status: 502 }
        );
      }

      throw error;
    }

    if (freshVoices.length === 0) {
      return NextResponse.json({ voices: typed, source: "cache" });
    }

    const mappedVoices: VoiceOption[] = freshVoices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.gender ?? null,
      accent: v.language ?? null,
      tone: null,
      preview_url: v.preview_audio ?? null,
      is_active: true,
    }));

    // Try to cache in DB (non-fatal if Supabase is unavailable)
    try {
      const { error: upsertError } = await supabase
        .from("voice_options")
        .upsert(
          mappedVoices.map((v) => ({ ...v })),
          { onConflict: "id" }
        );

      if (upsertError) {
        console.warn("[voices] Cache upsert failed (non-fatal):", upsertError.message);
      }
    } catch {
      console.warn("[voices] Cache write unavailable (non-fatal)");
    }

    return NextResponse.json({
      voices: mappedVoices,
      source: "fresh",
      synced: freshVoices.length,
    });
  } catch (error: unknown) {
    console.error("[voices] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch voices";
    const status = error instanceof HeyGenError ? error.statusCode : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Determines if the voice cache is stale (older than CACHE_TTL_DAYS).
 * Since voice_options doesn't have an updated_at column, we check
 * staleness by attempting a fresh fetch periodically.
 * For simplicity, we use a simple in-memory timestamp.
 */
let lastFetchTime = 0;

function isCacheStale(_voices: VoiceOption[]): boolean {
  const now = Date.now();
  const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

  if (now - lastFetchTime > ttlMs) {
    lastFetchTime = now;
    return true;
  }

  return false;
}
