/**
 * ElevenLabs API client
 *
 * Uses the Voice Library (/v1/shared-voices) for browsing 10,000+ voices
 * with server-side filtering by accent, gender, age, use_case, etc.
 * Also provides text-to-speech synthesis via /v1/text-to-speech.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

// ── Types ────────────────────────────────────────────────────

export interface SharedVoice {
  public_owner_id: string;
  voice_id: string;
  name: string;
  accent: string;
  gender: string;
  age: string;
  descriptive: string;
  use_case: string;
  category: string;
  language: string;
  description: string;
  preview_url: string;
  usage_character_count_1y: number;
  usage_character_count_7d: number;
  cloned_by_count: number;
  rate: number;
  free_users_allowed: boolean;
  live_moderation_enabled: boolean;
  notice_period: number;
}

export interface SharedVoicesResponse {
  voices: SharedVoice[];
  has_more: boolean;
  last_sort_id: string;
}

export interface VoiceSearchParams {
  search?: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  use_cases?: string[];
  descriptives?: string[];
  category?: string;
  featured?: boolean;
  page_size?: number;
  page?: number;
  sort?: string;
}

// ── List shared voices (Voice Library) ───────────────────────

export async function searchSharedVoices(
  params: VoiceSearchParams = {}
): Promise<SharedVoice[]> {
  const url = new URL(`${API_BASE}/shared-voices`);

  url.searchParams.set("page_size", String(params.page_size ?? 50));

  if (params.search) url.searchParams.set("search", params.search);
  if (params.gender) url.searchParams.set("gender", params.gender);
  if (params.age) url.searchParams.set("age", params.age);
  if (params.accent) url.searchParams.set("accent", params.accent);
  if (params.language) url.searchParams.set("language", params.language);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.featured) url.searchParams.set("featured", "true");
  if (params.page !== undefined) url.searchParams.set("page", String(params.page));
  if (params.sort) url.searchParams.set("sort", params.sort);

  if (params.use_cases) {
    for (const uc of params.use_cases) {
      url.searchParams.append("use_cases", uc);
    }
  }
  if (params.descriptives) {
    for (const d of params.descriptives) {
      url.searchParams.append("descriptives", d);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { "xi-api-key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs /shared-voices failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as SharedVoicesResponse;
  return data.voices ?? [];
}

// ── List account voices (fallback / personal voices) ─────────

export interface AccountVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  description: string | null;
  preview_url: string | null;
}

export async function listAccountVoices(): Promise<AccountVoice[]> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs /voices failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { voices: AccountVoice[] };
  return data.voices ?? [];
}

// ── Text-to-Speech with Timestamps ──────────────────────────

const MAX_CHARS_PER_REQUEST = 4500;

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  alignment?: CharacterAlignment;
}

async function synthesizeChunkWithTimestamps(
  voiceId: string,
  text: string,
  modelId: string,
): Promise<SynthesisResult> {
  const res = await fetch(
    `${API_BASE}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();

  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const alignment: CharacterAlignment | undefined = data.alignment ?? undefined;

  return { audioBuffer, alignment };
}

function splitTextAtSentences(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, maxLen);
    const lastSentenceEnd = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf(".\n"),
      slice.lastIndexOf("!\n"),
      slice.lastIndexOf("?\n")
    );

    const splitAt = lastSentenceEnd > maxLen * 0.3
      ? lastSentenceEnd + 1
      : maxLen;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter((c) => c.length > 0);
}

export async function synthesizeToAudio(
  voiceId: string,
  text: string,
  modelId = "eleven_v3"
): Promise<SynthesisResult> {
  const chunks = splitTextAtSentences(text, MAX_CHARS_PER_REQUEST);

  if (chunks.length === 1) {
    return synthesizeChunkWithTimestamps(voiceId, chunks[0], modelId);
  }

  const audioBuffers: Buffer[] = [];
  const accChars: string[] = [];
  const accStarts: number[] = [];
  const accEnds: number[] = [];
  let timeOffset = 0;

  for (const chunk of chunks) {
    const result = await synthesizeChunkWithTimestamps(voiceId, chunk, modelId);
    audioBuffers.push(result.audioBuffer);

    if (result.alignment) {
      const a = result.alignment;
      accChars.push(...a.characters);
      accStarts.push(...a.character_start_times_seconds.map((t) => t + timeOffset));
      accEnds.push(...a.character_end_times_seconds.map((t) => t + timeOffset));

      const lastEnd = a.character_end_times_seconds[a.character_end_times_seconds.length - 1] ?? 0;
      timeOffset += lastEnd;
    }
  }

  const alignment: CharacterAlignment | undefined =
    accChars.length > 0
      ? { characters: accChars, character_start_times_seconds: accStarts, character_end_times_seconds: accEnds }
      : undefined;

  return { audioBuffer: Buffer.concat(audioBuffers), alignment };
}

// ── Alignment → SRT conversion ──────────────────────────────

const WORDS_PER_CAPTION_CUE = 5;

export function alignmentToSRT(
  alignment: CharacterAlignment,
  wordsPerCue = WORDS_PER_CAPTION_CUE,
): string {
  const words: { text: string; start: number; end: number }[] = [];
  let cur = "";
  let wStart = 0;
  let wEnd = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const ch = alignment.characters[i];
    const s = alignment.character_start_times_seconds[i];
    const e = alignment.character_end_times_seconds[i];

    if (ch === " " || ch === "\n" || ch === "\r") {
      if (cur.length > 0) {
        words.push({ text: cur, start: wStart, end: wEnd });
        cur = "";
      }
    } else {
      if (cur.length === 0) wStart = s;
      cur += ch;
      wEnd = e;
    }
  }
  if (cur.length > 0) words.push({ text: cur, start: wStart, end: wEnd });

  if (words.length === 0) return "";

  const cues: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    const group = words.slice(i, i + wordsPerCue);
    const start = group[0].start;
    const end = group[group.length - 1].end;
    const text = group.map((w) => w.text).join(" ");

    const idx = cues.length + 1;
    cues.push(`${idx}\n${fmtSrtTime(start)} --> ${fmtSrtTime(end)}\n${text}`);
  }

  return cues.join("\n\n");
}

function fmtSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, "0")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
