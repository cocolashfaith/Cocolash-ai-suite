/**
 * lib/chat/tryon-compose.ts — Virtual lash try-on composition.
 *
 * This is intentionally separate from `lib/gemini/composition.ts`, which
 * generates marketing UGC images (a model holding the product box). The
 * chatbot try-on has a fundamentally different goal:
 *
 *   "Take the lashes from IMAGE 2 and apply them to the eyes of the
 *    person in IMAGE 1. Change nothing else."
 *
 * Identity preservation is the entire point. The prompt below is engineered
 * to fight Gemini's tendency to invent a new face when the input selfie
 * is small or low-resolution.
 */

import { generateImage, type ReferenceImage } from "../gemini/generate";
import { createAdminClient } from "../supabase/server";
import { uploadGeneratedImage } from "../supabase/storage";
import { readTryOnRefFromDisk } from "./tryon-refs";

export interface ComposeTryOnParams {
  /** The user's uploaded selfie. Must be a publicly fetchable URL. */
  selfieUrl: string;
  /** The curated lash-only reference image URL. */
  lashRefUrl: string;
  /** Stable id used to namespace the upload (e.g. session id). */
  brandId: string;
}

export interface ComposeTryOnResult {
  composedImageUrl: string;
  storagePath: string;
}

const TRYON_PROMPT = `You are performing a virtual false-lash try-on.

INPUT:
  IMAGE 1 — a real person's selfie. This is the customer.
  IMAGE 2 — a close-up product photo of a single false-lash strip.

YOUR TASK:
Return IMAGE 1, identical in every way, with EXACTLY ONE change: apply
the false-lash strip from IMAGE 2 realistically to BOTH of the customer's
upper eyelids, as if she has just put them on.

NON-NEGOTIABLE PRESERVATION RULES (in priority order):
1. The person's face, facial features, bone structure, jaw, nose, and
   mouth must be IDENTICAL to IMAGE 1. This is the same person — same
   identity. Do NOT generate a new person.
2. The person's skin tone, skin texture, freckles, blemishes, makeup,
   and undereye area must be IDENTICAL to IMAGE 1. Do NOT smooth,
   lighten, darken, or "beautify" the skin.
3. The person's hair (style, color, length, parting, flyaways) must
   be IDENTICAL to IMAGE 1. Do NOT restyle.
4. The person's clothing, jewellery, and accessories must be
   IDENTICAL to IMAGE 1.
5. The background, lighting direction, color cast, shadows, and
   camera angle must be IDENTICAL to IMAGE 1. Do NOT change the
   environment.
6. The person's expression, head tilt, and pose must be IDENTICAL
   to IMAGE 1.

THE ONE CHANGE YOU ARE MAKING:
Apply the lash strip from IMAGE 2 to her upper eyelids. Match the
length, curl, density, and color of the lashes from IMAGE 2 exactly.
Both eyes must receive the same lashes, mirrored. The lashes should
sit naturally along the lash line, blending with any existing lashes,
casting subtle shadows consistent with the original lighting.

DO NOT include the lash packaging, box, applicator, or hands holding
the product. The lashes are simply ON her eyes now.

CRITICAL: if you are unsure whether to change something, leave it
EXACTLY as it was in IMAGE 1.`;

const TRYON_NEGATIVE = `NEGATIVE: do not generate a new person, do not invent a different
face, do not change skin tone, do not smooth or beautify skin, do
not change hair, do not change clothing, do not change the
background, do not add the product packaging, do not add hands or
applicator tools, do not add text, watermarks, or logos, do not use
a studio background, do not change camera angle, do not stylize as
a 3d render or illustration.`;

export async function composeTryOn(
  params: ComposeTryOnParams
): Promise<ComposeTryOnResult> {
  const { selfieUrl, lashRefUrl, brandId } = params;

  const [selfieRef, lashRef] = await Promise.all([
    downloadAsReference(selfieUrl),
    downloadAsReference(lashRefUrl),
  ]);

  // Order matters: IMAGE 1 = customer, IMAGE 2 = lash strip.
  const referenceImages: ReferenceImage[] = [selfieRef, lashRef];

  const result = await generateImage(
    `${TRYON_PROMPT}\n\n${TRYON_NEGATIVE}`,
    "4:5",
    referenceImages,
    "[VIRTUAL LASH TRY-ON — preserve customer identity exactly]",
    "1K"
  );

  const supabase = await createAdminClient();
  const { url, path } = await uploadGeneratedImage(
    supabase,
    result.buffer,
    brandId,
    "-tryon",
    result.mimeType
  );

  return {
    composedImageUrl: url,
    storagePath: path,
  };
}

async function downloadAsReference(imageUrl: string): Promise<ReferenceImage> {
  // Site-relative path — read from disk. This avoids a loopback HTTP fetch
  // that would otherwise depend on NEXT_PUBLIC_APP_URL matching the actual
  // dev-server port.
  if (imageUrl.startsWith("/")) {
    const local = await readTryOnRefFromDisk(imageUrl);
    if (!local) {
      throw new Error(
        `try-on: relative path "${imageUrl}" is not a known curated reference`
      );
    }
    return {
      base64Data: local.buffer.toString("base64"),
      mimeType: local.mimeType,
    };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `try-on: failed to download reference image (${response.status}): ${imageUrl.slice(0, 120)}`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    base64Data: buffer.toString("base64"),
    mimeType: contentType,
  };
}
