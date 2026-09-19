"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Sparkles,
  Shuffle,
  Check,
  RefreshCw,
  Upload,
  X,
  AlertTriangle,
  Package,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  UGC_ETHNICITY_OPTIONS,
  UGC_SKIN_TONE_OPTIONS,
  UGC_AGE_RANGE_OPTIONS,
  UGC_HAIR_STYLE_OPTIONS,
  UGC_SCENE_OPTIONS,
  UGC_VIBE_OPTIONS,
  type UGCEthnicity,
  type UGCSkinTone,
  type UGCAgeRange,
  type UGCHairStyle,
  type UGCScene,
  type UGCVibe,
} from "@/lib/seedance/ugc-image-prompt";
import { LASH_STYLE_OPTIONS } from "@/lib/prompts/modules/lash-styles";
import type { LashStyle } from "@/lib/types";
import {
  fetchProductFacts,
  type ProductFacts,
} from "@/lib/ai/director/product-fact-extractor";
import type { SeedanceV4WizardState } from "../types";
import { CapabilityCard } from "../CapabilityCard";
import { ImageLightbox } from "../ImageLightbox";
import { inputLimitsFor } from "../lib/mode-input-rules";
import {
  STAGING_MODES,
  STAGING_MODE_LABELS,
  composePoseFor,
  defaultStagingMode,
  isComposePose,
  stagingModeForPose,
  type ComposePose,
  type StagingMode,
} from "@/lib/seedance/staging";

interface UgcModeProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
  onReady: () => void;
}

interface GalleryAvatar {
  id: string;
  image_url: string;
  created_at: string;
  /** Gallery tags — `ugc-avatar-composed` marks a shot already holding the product. */
  tags?: string[] | null;
}

/** One composed-avatar generation attempt, kept until approved or discarded. */
interface ComposedAttempt {
  url: string;
  /** H3(b) fact-check verdict (null = clean or still checking). */
  warning: string | null;
  checking: boolean;
  /** The staging pose this attempt was generated with (mismatch guard). */
  pose: ComposePose;
}

function pickRandom<T>(arr: readonly { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

// ── H1/H2/H3 + F7 pure helpers (docs/seedance-2.5/06-QUALITY-PASS.md) ──
// Kept outside the component and exported so they can be unit-tested: this
// suite runs `environment: "node"`, so there is no DOM to render into (same
// approach as ProductReferencePicker's exported list helpers).

/** F7 — non-blocking note when the selection mixes unrelated faces. */
export const MIXED_IDENTITY_WARNING =
  "Multiple influencer references with different faces will blend identities on render — one identity works best.";

/** H3(b) — non-blocking note when the composed product contradicts the refs. */
export const COMPOSE_FACT_WARNING =
  "The generated image may show the product incorrectly — regenerate or continue anyway.";

/** Fallback when no product facts were cached (the route requires a description). */
export const DEFAULT_COMPOSE_PRODUCT_DESCRIPTION =
  "the CocoLash product shown in the reference image";

/** Where an influencer reference came from. */
export type InfluencerOrigin = "generated" | "gallery" | "upload";

export interface InfluencerRef {
  url: string;
  origin: InfluencerOrigin;
  /** Generated avatars from ONE generate call share a batch id (same look). */
  batchId?: string;
}

/**
 * F7 — mixed-identity guard. Deliberately dumb and honest: no face
 * recognition, just provenance. Two references are "the same look" only when
 * they came out of the same generate call; anything uploaded, picked from the
 * gallery, or produced by a separate generate run is a different face.
 */
export function mixedIdentityWarning(
  refs: readonly InfluencerRef[]
): string | null {
  if (refs.length < 2) return null;
  const looks = new Set(
    refs.map((r) =>
      r.origin === "generated" && r.batchId ? `batch:${r.batchId}` : `solo:${r.url}`
    )
  );
  return looks.size > 1 ? MIXED_IDENTITY_WARNING : null;
}

/**
 * H2 — the composed shot is the FIRST influencer reference. `ugcProductImageUrls`
 * is never touched: the clean product photos stay authoritative for detail.
 */
export function composedFirst(
  current: readonly string[],
  composedUrl: string,
  cap: number
): string[] {
  const merged = [composedUrl, ...current.filter((u) => u !== composedUrl)];
  return merged.slice(0, Math.max(1, cap));
}

/**
 * H1 — a short, holdable noun phrase for the compose prompt, derived from the
 * cached product facts. The generate route REQUIRES `productDescription`
 * whenever `hasProduct` is true, so this never returns "".
 */
export function composeProductDescription(
  facts?: ProductFacts | null
): string {
  const type = facts?.productType?.trim();
  const packaging = facts?.packaging?.trim();
  const summary = facts?.summary?.trim();

  let text: string;
  if (type) text = packaging ? `${type} (${packaging})` : type;
  else if (packaging) text = packaging;
  else if (summary) text = summary;
  else return DEFAULT_COMPOSE_PRODUCT_DESCRIPTION;

  const full = /^(the|a|an)\b/i.test(text) ? text : `the ${text}`;
  return full.length > 240 ? `${full.slice(0, 237).trimEnd()}…` : full;
}

export interface AvatarRequestArgs {
  ethnicity: UGCEthnicity;
  skinTone: UGCSkinTone;
  ageRange: UGCAgeRange;
  hairStyle: UGCHairStyle;
  scene: UGCScene;
  vibe: UGCVibe;
  lashStyle: LashStyle;
  aspectRatio: string;
  /** H1 toggle. */
  composeEnabled: boolean;
  /**
   * Step-1 selection. ALL of them go to the image model — the route caps how
   * many it forwards (the API max).
   */
  productImageUrls?: readonly string[];
  productFacts?: ProductFacts;
  /** Staging pose for the composed shot (from the Staging control). */
  composePose?: ComposePose;
}

/**
 * H1 — the POST body for `/api/seedance/generate-ugc-image`. Compose only
 * engages when the toggle is ON *and* Step 1 actually produced a product
 * image; otherwise the avatar is generated alone, exactly as before.
 */
export function buildAvatarRequestBody(
  args: AvatarRequestArgs
): Record<string, unknown> {
  const base = {
    ethnicity: args.ethnicity,
    skinTone: args.skinTone,
    ageRange: args.ageRange,
    hairStyle: args.hairStyle,
    scene: args.scene,
    vibe: args.vibe,
    lashStyle: args.lashStyle,
    aspectRatio: args.aspectRatio,
  };
  const productImageUrls = args.composeEnabled
    ? (args.productImageUrls ?? []).filter(Boolean)
    : [];
  if (productImageUrls.length === 0) return { ...base, hasProduct: false };
  return {
    ...base,
    hasProduct: true,
    // Back-compat single field + the full set for multi-angle grounding.
    productImageUrl: productImageUrls[0],
    productImageUrls,
    productDescription: composeProductDescription(args.productFacts),
    ...(args.composePose ? { composePose: args.composePose } : {}),
  };
}

// ── H3(b): fact-check the composed product against the real references ──

/** Closure / material words that get invented on composed shots. */
const CLOSURE_TERMS = [
  "magnetic",
  "magnet",
  "zipper",
  "velcro",
  "clasp",
  "latch",
  "hinge",
  "glass",
] as const;

/** Coarse packaging vocabulary — enough to catch "box" turning into "tube". */
const PACKAGE_TERMS = [
  "box",
  "book",
  "tin",
  "pouch",
  "bag",
  "tube",
  "case",
  "tray",
  "jar",
  "bottle",
  "carton",
  "blister",
  "sachet",
  "compact",
  "palette",
] as const;

const ISNOT_STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "here",
  "there",
  "these",
  "those",
  "product",
  "visible",
  "anywhere",
]);

function factsText(facts: ProductFacts): string {
  return [
    facts.productType,
    facts.packaging,
    facts.colorsAndFinish,
    facts.notableDetails,
    facts.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function termsIn(text: string, vocab: readonly string[]): string[] {
  return vocab.filter((term) => new RegExp(`\\b${term}`).test(text));
}

/** "no magnetic closure" → ["magnetic", "closure"] */
function isNotKeywords(entry: string): string[] {
  return entry
    .toLowerCase()
    .replace(/^(no|not|non|without|lacks|does not have|doesn't have|there is no)\s+/, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !ISNOT_STOPWORDS.has(w));
}

/**
 * H3(b) — compare the facts extracted from the COMPOSED image against the
 * facts cached from the real product references. Returns a short human reason
 * on a material contradiction, or null. Intentionally conservative: it only
 * fires on (1) a feature the real refs explicitly listed as absent, (2) a
 * closure/material the real refs never show, or (3) a packaging type with no
 * overlap at all. Never blocks.
 */
export function composedProductContradiction(
  real?: ProductFacts | null,
  composed?: ProductFacts | null
): string | null {
  if (!real || !composed) return null;
  const realText = factsText(real);
  const composedText = factsText(composed);
  if (!realText || !composedText) return null;

  for (const entry of real.isNot ?? []) {
    const words = isNotKeywords(entry);
    if (words.length === 0) continue;
    if (words.every((w) => composedText.includes(w))) {
      return `the generated product looks like it has "${entry.trim()}", which the real product images say it does not`;
    }
  }

  const realClosures = new Set(termsIn(realText, CLOSURE_TERMS));
  for (const term of termsIn(composedText, CLOSURE_TERMS)) {
    if (!realClosures.has(term)) {
      return `the generated product shows "${term}", which never appears in the real product images`;
    }
  }

  const realPack = termsIn(realText, PACKAGE_TERMS);
  const composedPack = termsIn(composedText, PACKAGE_TERMS);
  if (
    realPack.length > 0 &&
    composedPack.length > 0 &&
    !composedPack.some((t) => realPack.includes(t))
  ) {
    return `the generated packaging reads as ${composedPack.join("/")} but the real product is ${realPack.join("/")}`;
  }

  return null;
}

/**
 * H3(b) driver. Best-effort by design: no cached facts, or an extractor that
 * fails, means NO warning — never a crash and never a false alarm.
 */
export async function checkComposedProductFacts(
  composedImageUrl: string,
  realFacts?: ProductFacts,
  fetchFacts: (urls: string[]) => Promise<ProductFacts> = fetchProductFacts
): Promise<string | null> {
  if (!realFacts) return null;
  try {
    const composedFacts = await fetchFacts([composedImageUrl]);
    return composedProductContradiction(realFacts, composedFacts);
  } catch {
    return null;
  }
}

/**
 * UGC Step 2 — the INFLUENCER side of the request (products are picked in
 * Step 1). Seedance 2.5 accepts several influencers, with products +
 * influencers combined ≤ 30 (D8), so all three tabs ADD to one selection:
 *
 *   - Generate: synthesize a UGC avatar from look traits.
 *   - Gallery:  multi-select avatars previously generated in this pipeline.
 *   - Upload:   bring one or more of your own influencer images.
 *
 * `ugcInfluencerImageUrl` is kept equal to `ugcInfluencerImageUrls[0]` — Step
 * 3's vision path still keys on the single-image field.
 */
export function UgcMode({ state, setState, onReady }: UgcModeProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "gallery" | "upload">(
    "generate"
  );

  // Avatar look params
  const [ethnicity, setEthnicity] = useState<UGCEthnicity>("Latina");
  const [skinTone, setSkinTone] = useState<UGCSkinTone>("Medium");
  const [ageRange, setAgeRange] = useState<UGCAgeRange>("25-34");
  const [hairStyle, setHairStyle] = useState<UGCHairStyle>("Wavy");
  const [scene, setScene] = useState<UGCScene>("casual-bedroom");
  const [vibe, setVibe] = useState<UGCVibe>("excited-discovery");
  const [lashStyle, setLashStyle] = useState<LashStyle>("natural");

  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // Gallery
  const [galleryAvatars, setGalleryAvatars] = useState<GalleryAvatar[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // H3(a) — a composed avatar is NOT auto-added. Every attempt lands in a
  // strip the user can regenerate into until satisfied, then explicitly
  // approve the one they like (clearly labelled "holding product"). Attempts
  // are also persisted server-side to the gallery (tag `ugc-avatar-composed`),
  // so a good one can be reused for a video in a LATER session.
  const [composedAttempts, setComposedAttempts] = useState<ComposedAttempt[]>(
    []
  );
  const [selectedComposedUrl, setSelectedComposedUrl] = useState<string | null>(
    null
  );
  /** The approved attempt's fact-check warning, carried into Continue. */
  const [composeWarning, setComposeWarning] = useState<string | null>(null);
  /** The composed image the user approved, once it is in the selection. */
  const [approvedComposedUrl, setApprovedComposedUrl] = useState<string | null>(
    null
  );
  /** The approved image's pose — Continue aligns staging to it (Codex F3). */
  const [approvedComposedPose, setApprovedComposedPose] =
    useState<ComposePose | null>(null);

  const selectedAttempt =
    composedAttempts.find((a) => a.url === selectedComposedUrl) ??
    composedAttempts[composedAttempts.length - 1] ??
    null;

  /** Click-to-zoom viewer for generated images (composed attempts, gallery). */
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // F7 — provenance of every chosen reference, for the mixed-identity guard.
  const [refOrigins, setRefOrigins] = useState<
    Record<string, { origin: InfluencerOrigin; batchId?: string }>
  >({});
  const batchSeq = useRef(0);

  const productCount = state.ugcProductImageUrls?.length ?? 0;
  const influencers = state.ugcInfluencerImageUrls ?? [];
  const combinedCap = inputLimitsFor(state.engine, "ugc").ugcCombined;
  const maxInfluencers = Math.max(0, combinedCap - productCount);
  const atLimit = influencers.length >= maxInfluencers;

  // H5 — default flipped ON 2026-09-17 after the A/B (compose-on won on
  // identity/scene continuity and opening product presence at equal cost).
  const composeEnabled = state.ugcComposeEnabled ?? true;
  const canCompose = productCount > 0;

  // Staging (2026-09-18): rig + product staging, auto-defaulted from the
  // Step-1 campaign type, overridable here. Drives the compose pose AND the
  // Director's rig physics in Step 3.
  const stagingMode: StagingMode =
    state.ugcComposeStaging ?? defaultStagingMode(state.campaignType);
  const activePose = composePoseFor(stagingMode, state.campaignType);

  /**
   * Gallery avatars composed with the product → their pose. Legacy composed
   * shots (before pose tags) were always "holding" (Codex F4).
   */
  const composedGalleryPoses = useMemo(() => {
    const map = new Map<string, ComposePose>();
    for (const a of galleryAvatars) {
      const tags = a.tags ?? [];
      if (!tags.includes("ugc-avatar-composed")) continue;
      const poseTag = tags
        .find((t) => t.startsWith("compose-pose:"))
        ?.slice("compose-pose:".length);
      map.set(a.image_url, isComposePose(poseTag) ? poseTag : "holding");
    }
    return map;
  }, [galleryAvatars]);
  /** Only true while the approved composed image is still in the selection. */
  const composedInSelection =
    !!approvedComposedUrl && influencers.includes(approvedComposedUrl);

  const identityWarning = mixedIdentityWarning(
    influencers.map((url) => ({
      url,
      origin: refOrigins[url]?.origin ?? "upload",
      batchId: refOrigins[url]?.batchId,
    }))
  );

  useEffect(() => {
    if (activeTab === "gallery" && galleryAvatars.length === 0) {
      void fetchGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchGallery() {
    setLoadingGallery(true);
    try {
      // Only UGC avatars produced by THIS Seedance pipeline (tag "ugc-avatar").
      const res = await fetch(
        "/api/images?limit=48&assetTag=ugc-avatar&sortBy=created_at&sortOrder=desc"
      );
      const data = await res.json();
      if (res.ok) {
        setGalleryAvatars(data.images ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingGallery(false);
    }
  }

  /** Remember where a reference came from (F7 mixed-identity heuristic). */
  const rememberOrigins = useCallback(
    (urls: string[], origin: InfluencerOrigin, batchId?: string) => {
      setRefOrigins((prev) => {
        const next = { ...prev };
        for (const url of urls) next[url] = { origin, batchId };
        return next;
      });
    },
    []
  );

  const addInfluencers = useCallback(
    (urls: string[], origin: InfluencerOrigin = "upload", batchId?: string) => {
      rememberOrigins(urls, origin, batchId);
      setState((prev) => {
        const current = prev.ugcInfluencerImageUrls ?? [];
        const cap = Math.max(
          0,
          inputLimitsFor(prev.engine, "ugc").ugcCombined -
            (prev.ugcProductImageUrls?.length ?? 0)
        );
        const merged = [...current];
        for (const url of urls) {
          if (merged.length >= cap) break;
          if (!merged.includes(url)) merged.push(url);
        }
        if (merged.length === current.length) return {};
        return { ugcInfluencerImageUrls: merged, ugcInfluencerImageUrl: merged[0] };
      });
    },
    [rememberOrigins, setState]
  );

  /**
   * H2 — the approved composed shot goes to position [0] of the influencer
   * array (and `ugcInfluencerImageUrl` mirrors [0], as everywhere else).
   * `ugcProductImageUrls` is never touched.
   */
  const addComposedFirst = useCallback(
    (url: string, batchId: string) => {
      rememberOrigins([url], "generated", batchId);
      setState((prev) => {
        const cap = Math.max(
          0,
          inputLimitsFor(prev.engine, "ugc").ugcCombined -
            (prev.ugcProductImageUrls?.length ?? 0)
        );
        const merged = composedFirst(prev.ugcInfluencerImageUrls ?? [], url, cap);
        return { ugcInfluencerImageUrls: merged, ugcInfluencerImageUrl: merged[0] };
      });
    },
    [rememberOrigins, setState]
  );

  const removeInfluencer = useCallback(
    (url: string) => {
      setState((prev) => {
        const next = (prev.ugcInfluencerImageUrls ?? []).filter((u) => u !== url);
        return { ugcInfluencerImageUrls: next, ugcInfluencerImageUrl: next[0] };
      });
    },
    [setState]
  );

  function toggleInfluencer(url: string) {
    if (influencers.includes(url)) {
      removeInfluencer(url);
      return;
    }
    if (atLimit) {
      toast.error(
        `Products + influencers are capped at ${combinedCap} — remove one first.`
      );
      return;
    }
    addInfluencers([url], "gallery");
  }

  function handleRandomize() {
    setEthnicity(pickRandom(UGC_ETHNICITY_OPTIONS));
    setSkinTone(pickRandom(UGC_SKIN_TONE_OPTIONS));
    setAgeRange(pickRandom(UGC_AGE_RANGE_OPTIONS));
    setHairStyle(pickRandom(UGC_HAIR_STYLE_OPTIONS));
    setScene(pickRandom(UGC_SCENE_OPTIONS));
    setVibe(pickRandom(UGC_VIBE_OPTIONS));
    setLashStyle(pickRandom(LASH_STYLE_OPTIONS));
    toast.success("Randomized!");
  }

  async function handleGenerateAvatar() {
    if (atLimit) {
      toast.error(`Products + influencers are capped at ${combinedCap}.`);
      return;
    }
    const composing = composeEnabled && canCompose;
    setIsGeneratingAvatar(true);
    try {
      const res = await fetch("/api/seedance/generate-ugc-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildAvatarRequestBody({
            ethnicity,
            skinTone,
            ageRange,
            hairStyle,
            scene,
            vibe,
            lashStyle,
            aspectRatio: "9:16",
            // H1 — compose only when the toggle is ON and Step 1 gave us a
            // product; otherwise the avatar is generated alone and the
            // products stay separate references.
            composeEnabled,
            productImageUrls: state.ugcProductImageUrls,
            productFacts: state.productFacts,
            composePose: activePose,
          })
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Avatar generation failed");

      if (!composing) {
        addInfluencers([data.imageUrl], "generated", `gen-${++batchSeq.current}`);
        toast.success("Avatar generated and added.");
        return;
      }

      // H3(a) — composed images wait for an explicit approval. Every attempt
      // is KEPT in the strip so the user can regenerate until satisfied and
      // then pick the best one — earlier attempts are never thrown away.
      setComposedAttempts((prev) => [
        ...prev,
        { url: data.imageUrl, warning: null, checking: true, pose: activePose },
      ]);
      setSelectedComposedUrl(data.imageUrl);
      toast.success("Composed avatar ready — review it below.");

      // H3(b) — best-effort fact check against the cached real-reference facts.
      const reason = await checkComposedProductFacts(
        data.imageUrl,
        state.productFacts
      );
      setComposedAttempts((prev) =>
        prev.map((a) =>
          a.url === data.imageUrl
            ? { ...a, warning: reason, checking: false }
            : a
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avatar generation failed");
    } finally {
      setIsGeneratingAvatar(false);
    }
  }

  /** H3(a) — the explicit approval gate on a composed avatar. */
  function handleApproveComposed() {
    if (!selectedAttempt) return;
    addComposedFirst(selectedAttempt.url, `gen-${++batchSeq.current}`);
    setApprovedComposedUrl(selectedAttempt.url);
    setApprovedComposedPose(selectedAttempt.pose);
    setComposeWarning(selectedAttempt.warning);
    // Pin the staging the approved shot was generated with, so Step 3's
    // Director stages the video against the SAME rig.
    setState({
      ugcComposeStaging: stagingModeForPose(selectedAttempt.pose),
    });
    // The strip's job is done — unapproved attempts stay in the gallery.
    setComposedAttempts([]);
    setSelectedComposedUrl(null);
    toast.success("Composed avatar added as the first influencer reference.");
  }

  /** Drop just the selected attempt; the rest of the strip stays. */
  function handleDiscardAttempt() {
    if (!selectedAttempt) return;
    const next = composedAttempts.filter((a) => a.url !== selectedAttempt.url);
    setComposedAttempts(next);
    setSelectedComposedUrl(next.length > 0 ? next[next.length - 1].url : null);
  }

  const handleContinue = useCallback(() => {
    const chosen = state.ugcInfluencerImageUrls ?? [];
    if (chosen.length === 0) {
      toast.error("Generate, pick, or upload at least one influencer image first.");
      return;
    }
    if ((state.ugcProductImageUrls?.length ?? 0) === 0) {
      toast.error("Go back to Step 1 and select at least one product image.");
      return;
    }

    // H2 — when a composed shot was approved it rides the normal influencer
    // array as entry [0]; `ugcWasComposed` stays TRUE so the Director (H4) and
    // the cost estimate know the reference already holds the product.
    // `ugcComposedImageUrl` deliberately stays undefined: that legacy field
    // switches Step 3 off the Enhancor-parity vision path, and H2 keeps the
    // clean product photos in play.
    const composedUrl =
      approvedComposedUrl && chosen.includes(approvedComposedUrl)
        ? approvedComposedUrl
        : null;
    const ordered = composedUrl
      ? composedFirst(chosen, composedUrl, chosen.length)
      : chosen;

    // A composed avatar picked from the GALLERY (a previous session's
    // attempt, tag `ugc-avatar-composed`) counts too — the Director must know
    // an influencer reference is already staged with the product either way.
    const galleryComposedUrl = ordered.find((u) => composedGalleryPoses.has(u));
    const composedPose: ComposePose | null = composedUrl
      ? (approvedComposedPose ?? "holding")
      : galleryComposedUrl
        ? (composedGalleryPoses.get(galleryComposedUrl) ?? "holding")
        : null;
    const hasComposedRef = composedPose !== null;

    // Codex F3/F4 — the composed reference's pose is authoritative: a desk
    // image cannot drive a selfie clip (or vice versa). If the Staging
    // control disagrees, align it to the reference and say so.
    let effectiveStaging = stagingMode;
    if (composedPose) {
      const implied = stagingModeForPose(composedPose);
      if (implied !== stagingMode) {
        toast.info(
          `Staging aligned to your composed reference (${STAGING_MODE_LABELS[implied].label}) — regenerate the composed avatar if you want the other setup.`
        );
      }
      effectiveStaging = implied;
    }

    setState({
      ugcInfluencerImageUrls: ordered,
      ugcInfluencerImageUrl: ordered[0],
      // Clear legacy single-image compose fields so Step 3 uses the vision path.
      ugcComposedImageUrl: undefined,
      ugcWasComposed: hasComposedRef,
      // Pin the effective staging so Step 3's Director gets the same rig the
      // composed reference (or, without one, the control/default) implies.
      ugcComposeStaging: effectiveStaging,
      ugcSeparateProductUrl: undefined,
      ugcComposeWarning:
        composedUrl && composeWarning
          ? `${COMPOSE_FACT_WARNING} Detail: ${composeWarning}.`
          : undefined,
    });
    onReady();
  }, [
    state.ugcInfluencerImageUrls,
    state.ugcProductImageUrls,
    approvedComposedUrl,
    approvedComposedPose,
    composeWarning,
    composedGalleryPoses,
    stagingMode,
    setState,
    onReady,
  ]);

  const canContinue = influencers.length > 0 && productCount >= 1;

  return (
    <div className="space-y-6">
      <CapabilityCard mode="ugc" />

      {/* Reference budget recap — products come from Step 1. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-[11px]",
          productCount > 0
            ? "border-coco-golden/30 bg-coco-golden/5 text-coco-brown-medium"
            : "border-coco-red-500/30 bg-coco-red-500/5 text-coco-red-500"
        )}
      >
        {productCount > 0 ? (
          <>
            <Check className="h-3.5 w-3.5 text-coco-golden" />
            {productCount} product image{productCount !== 1 ? "s" : ""} from Step 1 ·{" "}
            {influencers.length} / {maxInfluencers} influencer
            {maxInfluencers !== 1 ? "s" : ""} (combined cap {combinedCap}).
          </>
        ) : (
          <>No product selected — go back to Step 1 and pick at least one.</>
        )}
      </div>

      {/* Selected influencers */}
      {influencers.length > 0 && (
        <section className="space-y-2 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-coco-brown">Chosen influencers</h3>
            <p className="text-[11px] font-medium text-coco-golden">
              {influencers.length} / {maxInfluencers}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {influencers.map((url, i) => (
              <div key={url} className="group relative aspect-[9/16]">
                {/* Supabase / CDN hosts are not in next.config remotePatterns. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Influencer ${i + 1}`}
                  className="h-full w-full rounded-lg border-2 border-coco-golden/30 object-cover"
                />
                {composedInSelection && url === approvedComposedUrl && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-coco-brown/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    holding product
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeInfluencer(url)}
                  aria-label={`Remove influencer ${i + 1}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coco-brown/70 text-white transition-colors hover:bg-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* F7 — mixed-identity guard. Non-blocking, provenance-based only. */}
          {identityWarning && (
            <div className="flex items-start gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-800">{identityWarning}</p>
            </div>
          )}
        </section>
      )}

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-1.5 rounded-lg bg-coco-beige/50 p-1">
        <TabBtn
          active={activeTab === "generate"}
          onClick={() => setActiveTab("generate")}
          icon={Sparkles}
          label="Generate UGC Avatar"
        />
        <TabBtn
          active={activeTab === "gallery"}
          onClick={() => setActiveTab("gallery")}
          icon={ImageIcon}
          label="Select from Gallery"
        />
        <TabBtn
          active={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          icon={Upload}
          label="Upload Influencer"
        />
      </div>

      {activeTab === "generate" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">Avatar look</h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              These traits define the creator.{" "}
              {composeEnabled && canCompose
                ? "With compose on, each generated avatar is shown for review first — approve it and it becomes your first influencer reference."
                : "Each generated avatar is added to your influencer selection"}
              {" — "}
              the products you picked in Step 1 are sent to Seedance as separate references.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Dropdown label="Ethnicity" value={ethnicity} options={UGC_ETHNICITY_OPTIONS} onChange={(v) => setEthnicity(v as UGCEthnicity)} />
            <Dropdown label="Skin Tone" value={skinTone} options={UGC_SKIN_TONE_OPTIONS} onChange={(v) => setSkinTone(v as UGCSkinTone)} />
            <Dropdown label="Age Range" value={ageRange} options={UGC_AGE_RANGE_OPTIONS} onChange={(v) => setAgeRange(v as UGCAgeRange)} />
            <Dropdown label="Hair Style" value={hairStyle} options={UGC_HAIR_STYLE_OPTIONS} onChange={(v) => setHairStyle(v as UGCHairStyle)} />
            <Dropdown label="Scene" value={scene} options={UGC_SCENE_OPTIONS} onChange={(v) => setScene(v as UGCScene)} />
            <Dropdown label="Vibe" value={vibe} options={UGC_VIBE_OPTIONS} onChange={(v) => setVibe(v as UGCVibe)} />
          </div>

          {/* H1 — "Generate holding the product". Default ON since the
              2026-09-17 A/B (H5); still gated on Step-1 products and still
              switchable off. */}
          <div className="space-y-2 rounded-lg border-2 border-coco-beige-dark bg-white/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-coco-brown">
                  <Package className="h-3.5 w-3.5 text-coco-golden" />
                  Generate holding the product
                </p>
                <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
                  {canCompose
                    ? "Sends ALL your Step-1 product photos (up to 16) to the image model and composes the closed product into the avatar's hand. You review the result before it's used — the clean product photos still go to Seedance separately."
                    : "Pick product images in Step 1 first."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={composeEnabled && canCompose}
                aria-label="Generate holding the product"
                disabled={!canCompose}
                title={canCompose ? undefined : "Pick product images in Step 1 first"}
                onClick={() => {
                  const next = !composeEnabled;
                  setState({ ugcComposeEnabled: next });
                  if (!next) {
                    setComposedAttempts([]);
                    setSelectedComposedUrl(null);
                    setComposeWarning(null);
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  composeEnabled && canCompose
                    ? "bg-coco-golden"
                    : "bg-coco-brown-medium/20",
                  !canCompose && "cursor-not-allowed opacity-50"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                    composeEnabled && canCompose
                      ? "translate-x-[18px]"
                      : "translate-x-[3px]"
                  )}
                />
              </button>
            </div>

            {/* Staging control — auto-set from the campaign type, overridable.
                Decides the camera rig (how many hands are free) and whether
                the product sits on a desk or in her hand. */}
            {composeEnabled && canCompose && (
              <div className="border-t border-coco-beige-dark/60 pt-2">
                <p className="mb-1.5 text-[10px] font-medium text-coco-brown-medium/60">
                  Staging{" "}
                  <span className="font-normal">
                    (auto-picked for {state.campaignType} — change it if you
                    want a different setup)
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGING_MODES.map((mode) => {
                    const active = stagingMode === mode;
                    const { label, hint } = STAGING_MODE_LABELS[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        title={hint}
                        onClick={() => setState({ ugcComposeStaging: mode })}
                        className={cn(
                          "rounded-lg border-2 px-2 py-1 text-[10px] font-medium transition-all",
                          active
                            ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                            : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-coco-brown-medium/50">
                  {STAGING_MODE_LABELS[stagingMode].hint}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-coco-brown-medium/60">
              Lash style
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LASH_STYLE_OPTIONS.map((opt) => {
                const active = lashStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLashStyle(opt.value)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1 text-[10px] font-medium transition-all",
                      active
                        ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                        : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={handleGenerateAvatar}
              disabled={isGeneratingAvatar || atLimit}
              className="flex-1 gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
              size="lg"
            >
              {isGeneratingAvatar ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : influencers.length > 0 ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Generate Another Avatar
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate UGC Avatar
                </>
              )}
            </Button>
            <Button
              onClick={handleRandomize}
              variant="outline"
              size="lg"
              className="gap-2 py-5"
            >
              <Shuffle className="h-4 w-4" />
              Randomize
            </Button>
          </div>

          {/* H3(a) — approval gate. Composed shots are never auto-selected;
              every attempt is kept so you can regenerate until satisfied and
              pick the best one. */}
          {selectedAttempt && (
            <div className="space-y-3 rounded-xl border-2 border-coco-golden/40 bg-coco-golden/5 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-xs font-semibold text-coco-brown">
                  Composed avatar — holding product
                  {composedAttempts.length > 1 && (
                    <span className="ml-1.5 font-normal text-coco-brown-medium/60">
                      (attempt{" "}
                      {composedAttempts.findIndex(
                        (a) => a.url === selectedAttempt.url
                      ) + 1}{" "}
                      of {composedAttempts.length})
                    </span>
                  )}
                </h4>
                {selectedAttempt.checking && (
                  <span className="flex items-center gap-1 text-[10px] text-coco-brown-medium/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking the product…
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setLightboxSrc(selectedAttempt.url)}
                  title="Click to zoom"
                  className="relative w-24 shrink-0 cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedAttempt.url}
                    alt="Composed avatar holding product"
                    className="aspect-[9/16] w-full rounded-lg border-2 border-coco-golden/40 object-cover"
                  />
                  <span className="absolute bottom-1 left-1 rounded-full bg-coco-brown/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    holding product
                  </span>
                </button>
                <div className="flex-1 space-y-2">
                  <p className="text-[11px] text-coco-brown-medium/70">
                    Check the product: the front label should face the camera,
                    upright and readable. Not right? Regenerate as many times as
                    you like — every attempt stays here AND in your gallery, so
                    you can also come back and make the video later. Approving
                    adds the shown image as your FIRST influencer reference;
                    your Step-1 product photos still go to Seedance untouched.
                  </p>

                  {/* Mismatch guard: the shown attempt was generated under a
                      different staging than the current selection. */}
                  {selectedAttempt.pose !== activePose && (
                    <div className="flex items-start gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-2.5 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <p className="text-[11px] font-medium text-amber-900">
                        This attempt was generated with different staging than
                        you have selected now — regenerate so the reference
                        matches the video&apos;s setup, or switch the staging
                        back before approving.
                      </p>
                    </div>
                  )}

                  {/* H3(b) — amber, never blocking. */}
                  {selectedAttempt.warning && (
                    <div className="flex items-start gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-2.5 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-[11px] font-medium text-amber-900">
                          {COMPOSE_FACT_WARNING}
                        </p>
                        <p className="mt-0.5 text-[10px] text-amber-800">
                          {selectedAttempt.warning}.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApproveComposed}
                      className="gap-1.5 bg-coco-golden text-xs font-semibold text-white hover:bg-coco-golden-dark"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Use this image
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isGeneratingAvatar}
                      onClick={handleGenerateAvatar}
                      className="gap-1.5 text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleDiscardAttempt}
                      className="text-xs text-coco-brown-medium/70"
                    >
                      Discard attempt
                    </Button>
                  </div>
                </div>
              </div>

              {/* The attempts strip — tap to compare, then approve the best. */}
              {composedAttempts.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {composedAttempts.map((a, i) => (
                    <button
                      key={a.url}
                      type="button"
                      onClick={() => setSelectedComposedUrl(a.url)}
                      className={cn(
                        "relative aspect-[9/16] h-20 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                        a.url === selectedAttempt.url
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt={`Composed attempt ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute right-0.5 bottom-0.5 rounded bg-coco-brown/80 px-1 text-[8px] font-semibold text-white">
                        {i + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "gallery" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              Your Seedance UGC avatars
            </h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Avatars previously generated in this Seedance UGC pipeline — tap to add or
              remove. (Doesn&apos;t include images from the Generate page or Brand Content
              Studio pipeline.)
            </p>
          </div>
          {loadingGallery ? (
            <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
              <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
              <span className="ml-2 text-xs text-coco-brown-medium/50">
                Loading gallery…
              </span>
            </div>
          ) : galleryAvatars.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
              <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
              <p className="mt-2 text-xs text-coco-brown-medium/50">
                No UGC avatars yet — generate one first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {galleryAvatars.map((img) => {
                const isSelected = influencers.includes(img.image_url);
                const blocked = !isSelected && atLimit;
                return (
                  <button
                    key={img.id}
                    type="button"
                    disabled={blocked}
                    onClick={() => toggleInfluencer(img.image_url)}
                    className={cn(
                      "group relative aspect-[9/16] overflow-hidden rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-coco-golden ring-2 ring-coco-golden/30"
                        : "border-transparent hover:border-coco-golden/40",
                      blocked && "cursor-not-allowed opacity-40"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.image_url}
                      alt="UGC avatar"
                      className="h-full w-full object-cover"
                    />
                    {(img.tags ?? []).includes("ugc-avatar-composed") && (
                      <span className="absolute bottom-1 left-1 rounded-full bg-coco-brown/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        holding product
                      </span>
                    )}
                    <span
                      role="button"
                      aria-label="Zoom image"
                      title="Zoom"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxSrc(img.image_url);
                      }}
                      className="absolute top-1 right-1 rounded-md bg-coco-brown/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </span>
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "upload" && (
        <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              Influencer Images <span className="text-coco-golden">*</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-coco-brown-medium/60">
              Bring your own creator/talent images. They become the influencers the video is
              built around — pick several to give Seedance more angles.
            </p>
          </div>
          <InfluencerUploader
            disabled={atLimit}
            remaining={maxInfluencers - influencers.length}
            onUploaded={addInfluencers}
          />
        </section>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue || isGeneratingAvatar}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Continue to Prompt Review →
      </Button>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Generated image, zoomed"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all",
        active
          ? "bg-white text-coco-brown shadow-sm"
          : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-coco-brown-medium/60">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-coco-beige-dark bg-white px-3 py-2 text-xs text-coco-brown outline-none focus:border-coco-golden"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Multi-file influencer upload. Uses the existing /api/images/upload route
 * (public `generated-images` bucket) — the same path the single-image picker
 * used before, just batched.
 */
function InfluencerUploader({
  disabled,
  remaining,
  onUploaded,
}: {
  disabled: boolean;
  remaining: number;
  onUploaded: (urls: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const reset = () => {
      if (fileRef.current) fileRef.current.value = "";
    };
    if (picked.length === 0) return;

    const valid: File[] = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image — skipped.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" is over 10 MB — skipped.`);
        continue;
      }
      valid.push(file);
    }
    const toUpload = valid.slice(0, Math.max(0, remaining));
    if (valid.length > toUpload.length) {
      toast.warning(`Only ${Math.max(0, remaining)} more can be added.`);
    }
    if (toUpload.length === 0) {
      reset();
      return;
    }

    setUploading(true);
    const urls: string[] = [];
    try {
      for (const file of toUpload) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/images/upload", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          urls.push(data.image.image_url);
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`
          );
        }
      }
      if (urls.length > 0) {
        onUploaded(urls);
        toast.success(`${urls.length} influencer image${urls.length === 1 ? "" : "s"} added.`);
      }
    } finally {
      setUploading(false);
      reset();
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || disabled}
        className={cn(
          "w-full rounded-lg border-2 border-dashed border-coco-beige-dark px-4 py-6 text-center transition-all hover:border-coco-golden/40 hover:bg-coco-golden/5",
          (uploading || disabled) && "opacity-50"
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-coco-golden" />
            <p className="mt-1 text-xs text-coco-brown-medium">Uploading…</p>
          </>
        ) : (
          <>
            <Upload className="mx-auto h-5 w-5 text-coco-brown-medium/60" />
            <p className="mt-1 text-sm font-medium text-coco-brown">
              {disabled
                ? "Reference limit reached"
                : "Click to upload one or more influencer images"}
            </p>
          </>
        )}
      </button>
    </div>
  );
}
