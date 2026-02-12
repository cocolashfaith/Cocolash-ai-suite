/**
 * Product Photography Category Template
 *
 * Generates premium product staging imagery.
 * Now supports 8 sub-categories, each with its own strict prompt.
 *
 * When reference images are provided, ultra-strict fidelity instructions
 * are added to preserve the EXACT product appearance.
 */
import type { GenerationSelections, Scene, ProductCategoryKey } from "@/lib/types";
import { getSceneDescriptor } from "../modules/scenes";

// ── Sub-Category Context ──────────────────────────────────────
interface SubCategoryContext {
  subCategoryKey?: ProductCategoryKey;
  subCategoryLabel?: string;
  subCategoryDescription?: string;
}

// ── Per-Category Prompt Templates ─────────────────────────────
// Each template describes the EXACT product type to show and
// strict rules about what the AI can/cannot change.

const CATEGORY_PROMPTS: Record<ProductCategoryKey, string> = {
  "single-black-tray": `PRODUCT TYPE: Single lash pair in a round BLACK lidded tray/container.
WHAT THIS IS: A single pair of premium false eyelashes displayed in a small, round container
with a BLACK lid. The lid may have the CocoLash branding on top. Inside, you see one pair of
lashes resting on a white tray insert.
COMPOSITION RULES: Show ONLY ONE lash tray — not multiple. The tray can be shown open
(revealing lashes inside) or closed (showing the branded lid), or with lid placed beside the base.
You may show ONE tray from different angles. Do NOT add other CocoLash products.
STRICT CONSTRAINTS:
- Show ONLY a single round tray (not boxes, not kits, not pouches)
- The tray lid is BLACK/dark — do NOT change it to any other color
- If visible, the lashes inside should look natural and premium
- The CocoLash branding on the lid must match reference images exactly`,

  "single-nude-tray": `PRODUCT TYPE: Single lash pair in a round NUDE/BROWN lidded tray/container.
WHAT THIS IS: A single pair of premium false eyelashes displayed in a small, round container
with a NUDE/BROWN/TAN lid. The lid has CocoLash branding. Inside, one pair of lashes rests
on a white tray insert.
COMPOSITION RULES: Show ONLY ONE lash tray — not multiple. The tray can be open or closed.
You may place the lid beside the base for an "unboxing" feel. Do NOT add other products.
STRICT CONSTRAINTS:
- Show ONLY a single round tray (not boxes, not kits, not pouches)
- The tray lid is NUDE/BROWN/TAN — do NOT change it to black or any other color
- If visible, lashes should look natural and premium
- CocoLash branding must match reference images exactly`,

  "multi-lash-book": `PRODUCT TYPE: Multi-lash book box containing 5 pairs of lashes.
WHAT THIS IS: A book-style box that opens like a book, containing 5 pairs of lashes arranged
inside. The exterior has a premium feel with CocoLash branding. May be black or pink exterior.
COMPOSITION RULES: Show the book box as the hero — it can be closed (showing the front cover),
open (revealing the lash pairs inside), or partially open at an angle. ONE book box only.
STRICT CONSTRAINTS:
- This is a BOOK-STYLE box, not a round tray or a kit with accessories
- It contains MULTIPLE lash pairs (5 pairs) visible when open
- The exterior branding, colors, and finish must match reference images
- Do NOT add accessories like tweezers or glue — this is just the lash book`,

  "full-kit-pouch": `PRODUCT TYPE: Complete CocoLash kit with fabric storage pouch.
WHAT THIS IS: A full kit that includes lash pairs, accessories (tweezers, applicator, glue/bond,
sealant), and most importantly — a FABRIC STORAGE POUCH (linen/burlap/fabric bag). The pouch
is a key element of this product type.
COMPOSITION RULES: Show the FULL kit spread out or partially arranged. The fabric pouch should
be prominently visible. Accessories should be neatly displayed. Can show the pouch open with
items coming out of it, or everything arranged beside the pouch.
STRICT CONSTRAINTS:
- The FABRIC POUCH must be visible and prominent — it defines this product type
- Include accessories: tweezers, applicator, bond, sealant (as shown in references)
- All items must match the reference images — same colors, shapes, branding
- This is a COMPLETE KIT, not just lashes alone`,

  "full-kit-box": `PRODUCT TYPE: Complete CocoLash kit in a rigid cardboard box.
WHAT THIS IS: A full kit in a rigid, premium cardboard box (often with a mirror inside the lid).
Contains lash pairs, tweezers, applicator, bond, sealant, and other accessories arranged in
compartments. No fabric pouch — everything is in the box.
COMPOSITION RULES: Show the box open (revealing the organized interior with mirror and compartments),
or at an angle showing both the lid branding and the contents. Can also show closed with items
arranged beside it.
STRICT CONSTRAINTS:
- This is a RIGID BOX (not a pouch) — the box is the star
- If the box has an interior mirror, it should be visible when open
- Show the organized compartments with all accessories in place
- All items must match reference images — same products, same arrangement`,

  "storage-pouch": `PRODUCT TYPE: CocoLash fabric storage pouch/bag (standalone).
WHAT THIS IS: Just the linen/fabric/burlap storage bag with CocoLash branding, without any
other products. The pouch has a drawstring or zipper closure and CocoLash logo/text.
COMPOSITION RULES: Show ONLY the pouch — no other CocoLash products. Can be photographed
flat, standing up, slightly scrunched for texture, or with the closure visible. Keep it simple
and elegant.
STRICT CONSTRAINTS:
- Show ONLY the fabric pouch — no lash trays, no accessories, no boxes
- The fabric texture should be visible and natural-looking
- CocoLash branding on the pouch must match reference images exactly
- This is about the bag itself — its texture, quality, and branding`,

  "branding-flatlay": `PRODUCT TYPE: Styled flatlay / brand display with multiple CocoLash products.
WHAT THIS IS: An overhead or styled arrangement of MULTIPLE CocoLash products together.
This includes various trays, boxes, accessories, pouches — arranged artistically for branding
purposes. Think Instagram-worthy product displays.
COMPOSITION RULES: Show MULTIPLE products arranged in a flatlay (overhead) or styled display
composition. Include a variety of product types. Use brand-consistent styling with props.
STRICT CONSTRAINTS:
- Show MULTIPLE different CocoLash products together — this is a brand showcase
- All products must match their reference images (colors, shapes, branding)
- Arrangement should feel intentional and editorial, not random
- Can include styling props (marble, silk, dried flowers) that complement the brand`,
};

// ── Fidelity Block (always added when reference images exist) ─
function buildFidelityBlock(subCatLabel: string): string {
  return `[CRITICAL — PRODUCT FIDELITY DIRECTIVE]
You have been provided with reference images of the EXACT product(s) to feature.
These are NON-NEGOTIABLE constraints:

1. PRODUCT IDENTITY: The product(s) MUST be an EXACT visual match to the reference images.
   Do NOT invent, modify, redesign, or reimagine any product.
2. SHAPE & FORM: Preserve exact shapes, dimensions, proportions, and silhouettes.
3. COLOR & FINISH: Match exact colors, materials, textures, and finish (matte/glossy/fabric).
4. BRANDING & TEXT: Any text, logos, or labels on the product MUST appear identically.
   Do NOT omit, change, or add any branding elements.
5. PACKAGING DETAILS: Preserve all details — clasps, hinges, ribbons, embossing, foil stamps,
   cutouts, windows, stitching, drawstrings — exactly as they appear.
6. WHAT YOU CAN CHANGE:
   - Background/environment/scene/surface
   - Lighting angle and intensity (within brand guidelines)
   - Camera angle and composition
   - Props and styling elements AROUND (not on) the product
   - Depth of field and bokeh
7. WHAT YOU CANNOT CHANGE: The product(s). Zero modifications. Zero artistic liberties.
   They must look like the same physical objects photographed in a new setting.
8. PRODUCT TYPE: This is specifically "${subCatLabel}". Do NOT mix in products from other categories.
9. ACCURACY CHECK: Someone who owns this product must immediately recognize it as the exact same item.`;
}

// ── Main Builder ──────────────────────────────────────────────

export function buildProductPrompt(
  selections: GenerationSelections,
  resolvedScene: Exclude<Scene, "random">,
  hasProductReferenceImages = false,
  subCategory?: SubCategoryContext
): string {
  const sceneDesc = getSceneDescriptor(resolvedScene);
  const subCatKey = subCategory?.subCategoryKey;
  const subCatLabel = subCategory?.subCategoryLabel || "Product";

  // ── Surface & Props (randomized for variety) ────────────────
  const surfaceMaterials = [
    "on a polished rose-gold marble surface with soft reflections",
    "on a luxurious creamy beige velvet surface with subtle texture",
    "on a clean white marble surface with delicate gold veining",
    "on a warm wooden surface with a matte finish and natural grain",
  ];
  const surface = surfaceMaterials[Math.floor(Math.random() * surfaceMaterials.length)];

  const propSuggestions = [
    "styled with minimalist self-care props — a small rose quartz roller, dried pampas grass, and a silk eye mask in soft pink",
    "accompanied by elegant gold-accented accessories — a small mirror, delicate chain, and a fresh white rose",
    "surrounded by luxurious beauty essentials — a cotton pouch in beige, soft makeup brush, and a pearl earring",
    "arranged with botanical elements — eucalyptus sprigs, small amber glass bottle, and a warm-toned candle",
  ];
  const props = propSuggestions[Math.floor(Math.random() * propSuggestions.length)];

  const logoSpaceInstruction = selections.logoOverlay.enabled
    ? `\n\nLOGO SPACE: Leave intentional negative space in the ${selections.logoOverlay.position?.replace("-", " ") || "bottom right"} area of the image for logo overlay.`
    : "";

  // ── Category-Specific Prompt ────────────────────────────────
  const categorySpecificPrompt = subCatKey && CATEGORY_PROMPTS[subCatKey]
    ? CATEGORY_PROMPTS[subCatKey]
    : "";

  // ── Fidelity Block ──────────────────────────────────────────
  const fidelityBlock = hasProductReferenceImages
    ? `\n\n${buildFidelityBlock(subCatLabel)}`
    : "";

  // ── Subject Description ─────────────────────────────────────
  const subject = hasProductReferenceImages
    ? `The EXACT product shown in the reference images (${subCatLabel})`
    : "Luxury lash product packaging (a sleek, premium lash case/box)";

  return `CATEGORY: PRODUCT PHOTOGRAPHY — Premium commercial product staging.
${fidelityBlock}
${categorySpecificPrompt ? `\n${categorySpecificPrompt}` : ""}

SUBJECT: ${subject} displayed ${surface}. ${props}.

SCENE: ${sceneDesc}. Clean, aspirational, luxury beauty brand aesthetic.

COMPOSITION: Center-weighted composition with the product as the hero element. Shallow depth of field with the product in razor-sharp focus and background props softly blurred.

LIGHTING: Soft "glow" lighting from above and slightly behind, creating a warm halo effect around the product. Warm color temperature (3500K-4000K). Subtle rim light on product edges. No harsh shadows — diffused and flattering.

COLOR PALETTE: Warm brand colors throughout — soft pinks (#ead1c1), creamy beiges (#ede5d6), golden browns (#ce9765). All props and styling elements complement the CocoLash brand palette.

QUALITY: 8K commercial product photography quality. Ultra-sharp product detail. Professional color grading. Clean, magazine-worthy composition.

STYLE: Aspirational luxury — the kind of product image that makes you want to own it. Think Glossier meets Tom Ford meets Black-owned luxury brand.${logoSpaceInstruction}${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;
}
