"use client";

import { LipsyncBaseMode, type LipsyncBaseModeProps } from "./LipsyncMode";

/**
 * Voice Clone (Seedance 2.5 only) — same inputs as lip-sync (speaker images +
 * one audio clip ≤ 30 s), different intent: the audio is the voice to
 * reproduce, and the prompt is what that voice says.
 */
export function VoiceCloneMode(props: LipsyncBaseModeProps) {
  return <LipsyncBaseMode mode="voice_clone" {...props} />;
}
