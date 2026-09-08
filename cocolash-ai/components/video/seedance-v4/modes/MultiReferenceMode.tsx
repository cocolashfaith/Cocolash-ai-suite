"use client";

import { Button } from "@/components/ui/button";
import { AtMentionTextarea, type AtMention } from "../AtMentionTextarea";
import { CapabilityCard } from "../CapabilityCard";
import { ImageMultiPicker } from "../pickers/ImageMultiPicker";
import { MediaListPicker } from "../pickers/MediaListPicker";
import { inputLimitsFor } from "../lib/mode-input-rules";
import type { SeedanceV4WizardState } from "../types";

const ROLES = [
  { value: "appearance", label: "Appearance", desc: "Identity / face" },
  { value: "product", label: "Product", desc: "Product design" },
  { value: "background", label: "Background", desc: "Scene look" },
  { value: "style", label: "Style", desc: "Color / lighting ref" },
] as const;

type RefRole = (typeof ROLES)[number]["value"];

interface MultiReferenceModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

/**
 * Multi-Reference Step 2.
 *
 * Images, videos and audios are all optional individually but the API needs at
 * least ONE of them. Images additionally carry a role (appearance / product /
 * background / style) that the Director cites as @image1, @video1, @audio1.
 */
export function MultiReferenceMode({ state, setState, onReady }: MultiReferenceModeProps) {
  const limits = inputLimitsFor(state.engine, "multi_reference");
  const refs = state.multiReferenceImages ?? [];
  // `inputImageUrls` is the source of truth; fall back to the legacy
  // {url,role} array so a wizard rehydrated from older localStorage still
  // shows what the user picked before.
  const images =
    (state.inputImageUrls?.length ?? 0) > 0 ? state.inputImageUrls : refs.map((r) => r.url);
  const videos = state.inputVideoUrls ?? [];
  const audios = state.inputAudioUrls ?? [];

  /** Keep `multiReferenceImages` (url + role) aligned with the picked URLs. */
  function handleImages(urls: string[]) {
    setState((prev) => {
      const previous = prev.multiReferenceImages ?? [];
      const roleByUrl = new Map(previous.map((r) => [r.url, r.role]));
      return {
        inputImageUrls: urls,
        multiReferenceImages: urls.map((url) => ({
          url,
          role: roleByUrl.get(url) ?? "appearance",
        })),
      };
    });
  }

  function setRole(url: string, role: RefRole) {
    setState((prev) => ({
      multiReferenceImages: (prev.multiReferenceImages ?? []).map((r) =>
        r.url === url ? { ...r, role } : r
      ),
    }));
  }

  const hasAnyInput = images.length > 0 || videos.length > 0 || audios.length > 0;

  return (
    <div className="space-y-6">
      <CapabilityCard mode="multi_reference" />

      <ImageMultiPicker
        title="Reference images"
        help="Up to 30. Each one gets a role below, and the Director cites it as @image1, @image2…"
        max={limits.images}
        sources={["upload", "library", "gallery", "url"]}
        urls={images}
        onChange={handleImages}
      />

      {refs.length > 0 && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">What each image is for</h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Tell the Director the job each reference does.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {refs.map((r, i) => (
              <div
                key={r.url}
                className="overflow-hidden rounded-lg border-2 border-coco-beige-dark bg-white"
              >
                <div className="relative aspect-square">
                  {/* Supabase / CDN hosts are not in next.config remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url}
                    alt={`@image${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    @image{i + 1}
                  </span>
                </div>
                <select
                  value={r.role}
                  onChange={(e) => setRole(r.url, e.target.value as RefRole)}
                  aria-label={`Role for image ${i + 1}`}
                  className="w-full border-t border-coco-beige px-2 py-1 text-[11px] text-coco-brown outline-none"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      <MediaListPicker
        kind="video"
        title="Reference videos (optional)"
        help="Up to 10, combined length under 30 s. Cited as @video1, @video2…"
        max={limits.videos}
        urls={videos}
        onChange={(urls) => setState({ inputVideoUrls: urls })}
      />

      <MediaListPicker
        kind="audio"
        title="Reference audio (optional)"
        help="Up to 10, combined length under 30 s. Cited as @audio1, @audio2…"
        max={limits.audios}
        urls={audios}
        onChange={(urls) => setState({ inputAudioUrls: urls })}
      />

      <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
        <div>
          <h3 className="text-sm font-semibold text-coco-brown">
            Specific instructions for the Director (optional)
          </h3>
          <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
            Type <code className="rounded bg-coco-beige px-1">@</code> to reference an input —
            e.g. <code className="rounded bg-coco-beige px-1">@image1</code> for appearance,{" "}
            <code className="rounded bg-coco-beige px-1">@video1</code> for motion. The
            Director passes these through to Seedance as asset roles.
          </p>
        </div>
        <AtMentionTextarea
          value={state.multiReferenceUserInstructions ?? ""}
          onChange={(v) => setState({ multiReferenceUserInstructions: v })}
          mentions={[
            ...refs.map((r, i): AtMention => ({
              token: `@image${i + 1}`,
              role: capitalize(r.role),
              thumbUrl: r.url,
            })),
            ...videos.map((_, i): AtMention => ({ token: `@video${i + 1}`, role: "Video" })),
            ...audios.map((_, i): AtMention => ({ token: `@audio${i + 1}`, role: "Audio" })),
          ]}
          rows={4}
          placeholder='Tip: type "@" to insert a reference. Example: "@image1 is the creator. @image2 — @image5 are the product. Keep the face from @image1 unchanged."'
        />
      </section>

      <Button
        onClick={onReady}
        disabled={!hasAnyInput}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
