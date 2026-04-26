/**
 * Campaign Type Templates
 *
 * Pre-built focus areas and example openings for each campaign type.
 * Used by the user prompt builder to give the LLM specific direction.
 *
 * Legacy UGC-oriented templates (product-showcase, testimonial, promo,
 * unboxing, before-after) are kept for backward compatibility with
 * existing DB records and the Seedance pipeline.
 *
 * The HeyGen Brand Content Studio uses:
 *   brand-story, faq, myths, product-knowledge
 */

import type { CampaignType } from "@/lib/types";

export interface CampaignTemplate {
  label: string;
  description: string;
  focusAreas: string[];
  exampleHooks: string[];
}

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
  // ── HeyGen Brand Content Studio campaigns ───────────────────

  educational: {
    label: "Educational / Tutorial",
    description:
      "Teach, inform, and empower. The presenter is a knowledgeable beauty expert walking the viewer through a skill, technique, or concept related to lashes and beauty. Every tip should be immediately actionable. The viewer should leave feeling more confident about their lash game.",
    focusAreas: [
      "Step-by-step lash application: measuring, trimming, glue application, placement technique",
      "The 'look down into a mirror' trick for perfect placement every time",
      "How to choose the right CocoLash style for your eye shape (almond, round, hooded, monolid)",
      "Lash care and maintenance — cleaning, storing in the case, maximizing the 25+ wears",
      "Common mistakes and how to fix them: too much glue, not waiting for tackiness, wrong placement",
      "Quick fixes: how to reattach a lifting corner, blend with mascara, layer for extra drama",
      "Time-saving hacks — the 3-minute application method for beginners",
    ],
    exampleHooks: [
      "Let me show you the one trick that took my lash application from 10 minutes to under 3...",
      "If you're still struggling with lash placement, this is for you.",
      "I've applied thousands of lash sets. Here are the three mistakes I see most often...",
      "Most people skip this step — and it's the reason their lashes lift by noon.",
      "Let me walk you through the easiest way to apply false lashes if you've never done it before...",
      "Your eye shape matters more than you think when choosing lashes. Here's how to figure out yours...",
    ],
  },

  "brand-story": {
    label: "Brand Story",
    description:
      "Share the heart behind CocoLash — why it exists, who it's for, and what makes it different. This is intimate, personal storytelling. The presenter speaks as a founder, ambassador, or long-time advocate sharing something they genuinely believe in. The goal is emotional connection and brand trust, not sales.",
    focusAreas: [
      "Why CocoLash was created — the gap in the market for lashes designed specifically for Black women",
      "The mission: celebrating melanin beauty, diverse eye shapes, and confidence",
      "Quality commitment — hand-crafted fibers, flexible cotton bands, 25+ wears per pair",
      "Community and representation — designed by the community it serves",
      "Cruelty-free and vegan values — why this matters to the brand and its customers",
      "The luxury experience — from the magnetic packaging to the first wear",
      "Customer stories and impact — how CocoLash has changed someone's beauty routine or confidence",
    ],
    exampleHooks: [
      "Let me tell you why CocoLash exists — because for a long time, we were an afterthought.",
      "When we started CocoLash, there was one thing we knew for sure...",
      "I want to share something personal about why this brand matters to me...",
      "Have you ever felt like a product just wasn't made with you in mind? That's exactly where our story starts.",
      "There's a reason every detail of CocoLash is intentional. Let me walk you through it...",
      "We didn't just want to make lashes. We wanted to make something that felt like it was ours.",
    ],
  },

  faq: {
    label: "FAQ",
    description:
      "Answer the most common questions and concerns about false lashes and CocoLash specifically. The presenter is a patient, credible expert giving clear, definitive answers with facts and personal experience. Each answer should feel thorough — the viewer should walk away with clarity and confidence.",
    focusAreas: [
      "Do false lashes damage your natural lashes? (No — with proper application and removal)",
      "How many times can you reuse CocoLash lashes? (25+ wears with proper care)",
      "What's the best lash glue to use? (Latex-free options, application tips)",
      "Are CocoLash lashes comfortable for all-day wear? (Yes — 12+ hours, lightweight cotton band)",
      "What style suits my eye shape? (Almond → cat-eye, round → wispy, hooded → dramatic)",
      "Can beginners apply false lashes? (Yes — under 5 minutes with practice)",
      "Are they really cruelty-free? (Yes — vegan, cruelty-free, hand-crafted)",
      "Why are these more expensive than drugstore lashes? (Reusable 25+ times, premium materials, designed for specific eye shapes)",
    ],
    exampleHooks: [
      "I hear this question all the time: 'Do false lashes ruin your real lashes?' Let me give you the real answer...",
      "The number one question I get asked is... and the answer might surprise you.",
      "Let's talk about the thing everyone wants to know but nobody asks...",
      "If you've been on the fence about false lashes because of this concern — let me put your mind at ease.",
      "Someone asked me this the other day, and I realized a lot of people probably have the same question...",
      "This is probably the question I get asked the most. Here's what you need to know...",
    ],
  },

  myths: {
    label: "Myth-Busting",
    description:
      "Tackle the most persistent myths, misconceptions, and pieces of bad advice about false lashes. The presenter is a confident expert who's here to set the record straight — not in a condescending way, but with the energy of someone who genuinely cares about getting the truth out. Each myth should be clearly stated, then dismantled with facts, logic, and real experience.",
    focusAreas: [
      "MYTH: False lashes ruin your natural lashes (TRUTH: Only if removed improperly — CocoLash cotton bands are gentle)",
      "MYTH: False lashes are only for special occasions (TRUTH: Everyday wear is easy with lightweight styles like natural or wispy)",
      "MYTH: All false lashes feel heavy and uncomfortable (TRUTH: Cotton-band lashes like CocoLash are barely noticeable after 10 minutes)",
      "MYTH: Cheaper lashes are just as good (TRUTH: Drugstore lashes use plastic bands, last 1-3 wears, and can irritate)",
      "MYTH: You need to be a makeup pro to apply false lashes (TRUTH: Most beginners get the hang of it in 2-3 tries)",
      "MYTH: Lash glue is toxic and bad for your eyes (TRUTH: Latex-free, dermatologically tested options are safe for daily use)",
      "MYTH: False lashes and lash extensions are the same thing (TRUTH: Strip lashes are non-invasive, affordable, and removable any time)",
      "MYTH: One lash style works for everyone (TRUTH: Eye shape, lid space, and desired look all affect which style is best)",
    ],
    exampleHooks: [
      "There's a myth about false lashes that I need to address...",
      "I keep seeing this piece of bad advice online and it's time to set the record straight...",
      "If someone told you this about lashes, they were wrong. Here's why...",
      "Let's bust one of the biggest misconceptions in the lash world...",
      "This myth has been around forever and it's keeping people from trying something they'd love...",
      "Okay, we need to talk about this. Because the misinformation is getting out of hand...",
    ],
  },

  "product-knowledge": {
    label: "Product Knowledge",
    description:
      "Deep-dive into the details that make CocoLash products special. This is for the viewer who's already interested — they want to understand the craftsmanship, materials, and thought behind the product. The presenter is a knowledgeable guide, almost like a behind-the-scenes tour. Educational and appreciative, not promotional.",
    focusAreas: [
      "The cotton band — what it is, why it matters, how it compares to plastic bands",
      "Hand-crafted fibers — the construction process and why hand-made means better fit",
      "Style breakdown — what makes each style different (natural, volume, dramatic, cat-eye, wispy, doll-eye, hybrid, mega-volume)",
      "Reusability and longevity — how the 25+ wear claim works and how to maximize it",
      "The magnetic closure packaging — unboxing experience, storage, travel-friendliness",
      "Material sourcing — cruelty-free, vegan, and what that means for the product",
      "Fit and comfort science — why lightweight construction matters over 12+ hours of wear",
      "How to identify your ideal CocoLash style based on desired look, eye shape, and occasion",
    ],
    exampleHooks: [
      "Let me show you what's actually inside a CocoLash pair — because the details matter.",
      "Most people don't know this about lash bands, and it changes everything about how they feel...",
      "I want to break down exactly what makes these different from what you'd find at the drugstore.",
      "Let's talk about why the cotton band is probably the most important part of any false lash...",
      "There are eight CocoLash styles, and each one is designed for a specific look. Here's how to choose...",
      "The difference between a $5 lash and a CocoLash isn't just marketing. Let me explain...",
    ],
  },

  // ── Legacy UGC campaigns (kept for Seedance pipeline + DB compat) ──

  "product-showcase": {
    label: "Product Showcase",
    description:
      "Highlight the product itself — packaging, quality, craftsmanship, and what makes CocoLash stand out in a saturated market. The product is the star; the person is the storyteller.",
    focusAreas: [
      "Unboxing or first impression — the weight of the box, the magnetic closure, the presentation",
      "Quality close-ups — the hand-crafted lash fibers, the flexible cotton band, the reusable design",
      "What makes CocoLash different: designed by and for Black women, cruelty-free, up to 25+ wears per pair",
      "The 'treat yourself' moment — luxury at an accessible price point",
      "Sensory details: how the lashes feel between your fingers, the softness, the natural curl pattern",
      "Comparison without naming competitors — subtly show why these are superior",
    ],
    exampleHooks: [
      "Okay but have you SEEN these lashes up close?",
      "I need to talk about this packaging for a second...",
      "The lashes that literally changed my entire routine...",
      "When I tell you these are the *softest* lashes I've ever touched...",
      "I've spent hundreds on lashes and NOTHING compares to this quality...",
      "The way this box opens... girl, it's an *experience*.",
      "These lashes are handmade and you can actually TELL...",
    ],
  },

  testimonial: {
    label: "Testimonial",
    description:
      "Personal, authentic review — sharing a genuine experience with CocoLash. This should feel like an honest friend telling you about something she loves, not a paid promotion.",
    focusAreas: [
      "Personal story of discovering CocoLash — what prompted the first purchase",
      "Before vs after transformation — the confidence shift, not just the visual change",
      "How the lashes make her feel — powerful, beautiful, put-together, like her best self",
      "Specific moments the lashes elevated: date night, job interview, girls' night",
      "Addressing skepticism honestly — 'I wasn't sure at first, but...'",
      "Long-term use perspective — durability, comfort over a full day, reusability",
    ],
    exampleHooks: [
      "Okay I've been wearing these for two weeks and I have *thoughts*...",
      "So I finally tried those lashes everyone's been talking about...",
      "Real talk — I was skeptical about another lash brand. But then...",
      "The difference these lashes made at my sister's wedding? Let me tell you...",
      "I wore these for 14 hours straight and I need to tell you what happened...",
      "I almost didn't try these. I'm SO glad I did...",
    ],
  },

  promo: {
    label: "Sale / Promotion",
    description:
      "Urgency-driven content — there's a deal, a drop, or a limited offer happening right now. Balance hype with authenticity.",
    focusAreas: [
      "The specific offer: discount percentage, bundle deal, free shipping, or limited edition drop",
      "Why NOW is the time — scarcity, limited stock, seasonal timing",
      "Value proposition — break down what they're getting versus the normal price",
      "Social proof — 'these sold out last time', 'my followers keep asking'",
      "Remove purchase barriers — easy returns, fast shipping, worth every penny",
      "Create FOMO without being obnoxious — genuine excitement, not pressure",
    ],
    exampleHooks: [
      "Stop scrolling — this sale literally ends tonight...",
      "If you've been on the fence about CocoLash... THIS is your sign.",
      "I'm about to save you money and upgrade your lash game at the same time...",
      "They put my favorites on sale and I'm not gatekeeping...",
      "RUN don't walk — these are about to sell out again...",
    ],
  },

  unboxing: {
    label: "Unboxing",
    description:
      "First-look, unboxing experience — ASMR-adjacent, visual, tactile, and satisfying. Let the packaging speak for itself.",
    focusAreas: [
      "The shipping package arrival — anticipation, branded packaging, care in presentation",
      "The box — magnetic closure, the weight, the design, tissue paper or inserts",
      "First tactile impression — lifting the lashes out, feeling the fibers, examining the band",
      "What's included — lash pair, case, tools, thank-you card, brand touches",
      "The satisfying reveal moment — camera close-up, slow pull",
      "Genuine first reaction — delight, surprise at quality, excitement to try them on",
    ],
    exampleHooks: [
      "My CocoLash order just arrived and I'm opening it live...",
      "ASMR unboxing of the prettiest lashes I've ever ordered...",
      "New lash day hits different when the packaging looks like THIS...",
    ],
  },

  "before-after": {
    label: "Before & After",
    description:
      "Transformation content — showing the dramatic difference CocoLash lashes make. The power is in the contrast.",
    focusAreas: [
      "The bare-lash 'before' — relatable, no-makeup or minimal-makeup look",
      "The application moment — show how quick and easy it is",
      "The 'after' reveal — dramatic camera change or slow turn",
      "The reaction — genuine surprise at the transformation",
      "Side-by-side comparison — one eye with, one without",
      "How the transformation makes her feel — confidence boost, 'main character' energy",
    ],
    exampleHooks: [
      "From 'just woke up' to 'just stepped out of Vogue' in 3 minutes...",
      "This is my face without lashes... and THIS is my face with CocoLash.",
      "The glow up is REAL and it takes literally 5 minutes...",
    ],
  },
};

export const CAMPAIGN_CONCEPT_POOLS: Partial<Record<CampaignType, string[]>> = {
  "brand-story": [
    "The moment we realized most lash brands weren't designing for Black women",
    "Why we chose cruelty-free, vegan materials from day one",
    "The story behind our magnetic-closure luxury packaging",
    "How customer feedback shaped our style range",
    "What 'designed by us, for us' means in practice",
    "The gap between drugstore lashes and what we wanted to create",
    "Our commitment to celebrating diverse eye shapes",
    "Why cotton bands changed everything for comfort",
    "The first time a customer said CocoLash gave her confidence",
    "Building a beauty brand rooted in representation",
  ],
  faq: [
    "Do false lashes damage your natural lashes?",
    "How many times can you reuse CocoLash lashes?",
    "What lash glue works best with CocoLash?",
    "Are CocoLash lashes comfortable for 12+ hours?",
    "Which CocoLash style suits hooded eyes?",
    "Can a complete beginner apply these lashes?",
    "Are CocoLash lashes truly cruelty-free and vegan?",
    "Why are CocoLash lashes more expensive than drugstore brands?",
    "How do I clean and store my CocoLash lashes?",
    "What's the difference between natural, volume, and dramatic styles?",
  ],
  myths: [
    "False lashes ruin your natural lashes",
    "False lashes are only for special occasions",
    "All false lashes feel heavy and uncomfortable",
    "Cheap lashes work just as well as premium ones",
    "You need professional skills to apply false lashes",
    "Lash glue is toxic and bad for your eyes",
    "False lashes and lash extensions are the same thing",
    "One lash style works for everyone",
    "You can't wear false lashes if you have sensitive eyes",
    "False lashes look obviously fake up close",
  ],
  "product-knowledge": [
    "Deep dive into the cotton band technology",
    "Understanding the 8 CocoLash styles and which suits you",
    "How hand-crafted fibers differ from machine-made",
    "The science behind 25+ wears per pair",
    "What makes the magnetic-closure packaging special",
    "CocoLash materials: cruelty-free, vegan, and why it matters",
    "Comfort science: why lightweight construction matters over 12 hours",
    "How to match your CocoLash style to your eye shape and occasion",
    "The difference between cotton bands and plastic bands",
    "Behind the scenes: how a CocoLash pair is made",
  ],
  educational: [
    "Step-by-step lash application for beginners",
    "The mirror trick for perfect placement",
    "Choosing the right lash style for your eye shape",
    "Lash care and maintenance for maximum reuse",
    "Common lash application mistakes and how to fix them",
    "Quick fixes for lash lifting and corner popping",
    "The 3-minute application method",
    "How to blend false lashes with your natural lashes",
    "Lash glue application tips for a strong hold",
    "Evening vs. daytime lash looks",
  ],
  "product-showcase": [
    "Unboxing the full CocoLash experience",
    "Close-up quality comparison with drugstore lashes",
    "The luxury packaging reveal",
    "First touch and feel impressions",
    "Comparing lash weight and flexibility",
    "The magnetic closure box experience",
  ],
  testimonial: [
    "How CocoLash changed my daily routine",
    "My honest review after 3 weeks of daily wear",
    "The confidence shift from finding the right lashes",
    "From lash skeptic to CocoLash convert",
    "Why I stopped buying drugstore lashes",
    "My favorite CocoLash style and why",
  ],
};
