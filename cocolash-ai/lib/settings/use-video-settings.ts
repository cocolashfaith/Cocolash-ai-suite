"use client";

/**
 * useVideoSettings — client hook for the global video defaults (D5).
 *
 * GET /api/settings/video → { settings, fromDatabase, missingTable }.
 * Falls back to DEFAULT_VIDEO_SETTINGS on any failure, so the wizard and the
 * cost estimator always have values. One in-flight fetch is shared across all
 * mounted consumers (module-level cache, 60 s TTL); `refresh()` bypasses it.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_VIDEO_SETTINGS,
  mergeVideoSettings,
  type VideoSettings,
  type VideoSettingsResponse,
} from "./video-settings";

export interface UseVideoSettingsResult {
  settings: VideoSettings;
  /** true until the first fetch resolves (defaults are returned meanwhile). */
  loading: boolean;
  fromDatabase: boolean;
  missingTable: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CACHE_TTL_MS = 60_000;

let cached: { at: number; value: VideoSettingsResponse } | null = null;
let inflight: Promise<VideoSettingsResponse> | null = null;

async function fetchVideoSettings(force = false): Promise<VideoSettingsResponse> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/settings/video", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/settings/video → ${res.status}`);
      const json = (await res.json()) as Partial<VideoSettingsResponse>;
      const value: VideoSettingsResponse = {
        settings: mergeVideoSettings(json.settings as Partial<VideoSettings> | undefined),
        fromDatabase: !!json.fromDatabase,
        missingTable: !!json.missingTable,
      };
      cached = { at: Date.now(), value };
      return value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test hook / hard reset. */
export function _resetVideoSettingsCache(): void {
  cached = null;
  inflight = null;
}

export function useVideoSettings(): UseVideoSettingsResult {
  const [state, setState] = useState<{
    settings: VideoSettings;
    loading: boolean;
    fromDatabase: boolean;
    missingTable: boolean;
    error: string | null;
  }>({
    settings: cached?.value.settings ?? DEFAULT_VIDEO_SETTINGS,
    loading: !cached,
    fromDatabase: cached?.value.fromDatabase ?? false,
    missingTable: cached?.value.missingTable ?? false,
    error: null,
  });

  const load = useCallback(async (force: boolean) => {
    try {
      const value = await fetchVideoSettings(force);
      setState({
        settings: value.settings,
        loading: false,
        fromDatabase: value.fromDatabase,
        missingTable: value.missingTable,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load video settings",
      }));
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh };
}
