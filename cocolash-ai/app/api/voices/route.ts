import { NextRequest, NextResponse } from "next/server";
import {
  searchSharedVoices,
  listAccountVoices,
} from "@/lib/elevenlabs/client";
import type { VoiceOption } from "@/lib/types";

/**
 * GET /api/voices
 *
 * Proxies ElevenLabs Voice Library (/v1/shared-voices) with server-side
 * filtering.  Falls back to account voices when shared-voices is empty.
 *
 * Query params (all optional):
 *   search   – free-text keyword search
 *   gender   – "male" | "female"
 *   age      – "young" | "middle_aged" | "old"
 *   accent   – e.g. "american", "british"
 *   language – e.g. "en", "es"
 *   page     – 0-indexed page number (default 0)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const search = sp.get("search") || undefined;
    const gender = sp.get("gender") || undefined;
    const age = sp.get("age") || undefined;
    const accent = sp.get("accent") || undefined;
    const language = sp.get("language") || undefined;
    const pageStr = sp.get("page");
    const page = pageStr ? parseInt(pageStr, 10) : 0;

    let voices: VoiceOption[];

    try {
      const shared = await searchSharedVoices({
        search,
        gender,
        age,
        accent,
        language,
        page,
        page_size: 50,
        sort: "trending",
      });

      voices = shared.map((v) => ({
        id: v.voice_id,
        name: v.name,
        gender: v.gender || null,
        accent: v.accent || null,
        tone: v.descriptive || null,
        preview_url: v.preview_url || null,
        is_active: true,
        age: v.age || null,
        descriptive: v.descriptive || null,
        use_case: v.use_case || null,
        provider: "elevenlabs" as const,
      }));
    } catch (sharedError) {
      console.warn("[voices] Shared voices failed, falling back to account voices:", sharedError);

      const account = await listAccountVoices();
      voices = account.map((v) => ({
        id: v.voice_id,
        name: v.name,
        gender: v.labels?.gender ?? null,
        accent: v.labels?.accent ?? null,
        tone: v.labels?.description ?? null,
        preview_url: v.preview_url ?? null,
        is_active: true,
        age: v.labels?.age ?? null,
        descriptive: v.labels?.description ?? null,
        use_case: v.labels?.use_case ?? null,
        provider: "elevenlabs" as const,
      }));
    }

    return NextResponse.json({
      voices,
      source: "elevenlabs",
      count: voices.length,
      page,
    });
  } catch (error: unknown) {
    console.error("[voices] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch voices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
