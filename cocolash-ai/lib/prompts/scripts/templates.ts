/**
 * Campaign Type Templates
 *
 * Pre-built focus areas and example hooks for each campaign type.
 * Used by the user prompt builder to give Claude specific direction
 * about what kind of script to write.
 */

import type { CampaignType } from "@/lib/types";

export interface CampaignTemplate {
  label: string;
  description: string;
  focusAreas: string[];
  exampleHooks: string[];
}

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
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
      "Personal, authentic review — sharing a genuine experience with CocoLash. This should feel like an honest friend telling you about something she loves, not a paid promotion. Vulnerability and specificity make it believable.",
    focusAreas: [
      "Personal story of discovering CocoLash — what prompted the first purchase",
      "Before vs after transformation — the confidence shift, not just the visual change",
      "How the lashes make her feel — powerful, beautiful, put-together, like her best self",
      "Specific moments the lashes elevated: date night, job interview, girls' night, Sunday brunch, a random Tuesday",
      "Addressing skepticism honestly — 'I wasn't sure at first, but...'",
      "Long-term use perspective — durability, comfort over a full day, reusability",
      "Emotional connection — how beauty confidence radiates into other parts of life",
    ],
    exampleHooks: [
      "Okay I've been wearing these for two weeks and I have *thoughts*...",
      "So I finally tried those lashes everyone's been talking about...",
      "Real talk — I was skeptical about another lash brand. But then...",
      "The difference these lashes made at my sister's wedding? Let me tell you...",
      "I wore these for 14 hours straight and I need to tell you what happened...",
      "I almost didn't try these. I'm SO glad I did...",
      "My coworker stopped me in the hall like 'WHAT are those lashes?'...",
      "If you only listen to me about one thing... let it be this.",
    ],
  },

  promo: {
    label: "Sale / Promotion",
    description:
      "Urgency-driven content — there's a deal, a drop, or a limited offer happening right now. The goal is to convert fence-sitters into buyers. Balance hype with authenticity — it should feel like a friend tipping you off, not an infomercial.",
    focusAreas: [
      "The specific offer: discount percentage, bundle deal, free shipping, gift with purchase, or limited edition drop",
      "Why NOW is the time — scarcity, limited stock, seasonal timing, or 'treat yourself' justification",
      "Value proposition — break down what they're getting versus the normal price",
      "Social proof woven in — 'these sold out last time', 'my followers keep asking'",
      "Remove purchase barriers — easy returns, fast shipping, worth every penny",
      "Create FOMO without being obnoxious — genuine excitement, not pressure",
    ],
    exampleHooks: [
      "Stop scrolling — this sale literally ends tonight...",
      "If you've been on the fence about CocoLash... THIS is your sign.",
      "I'm about to save you money and upgrade your lash game at the same time...",
      "They put my favorites on sale and I'm not gatekeeping...",
      "RUN don't walk — these are about to sell out again...",
      "The one time a year you can get these for THIS price...",
      "I just got the best deal on lashes and I'm telling everyone...",
      "Somebody tell me why I just bought three pairs... oh wait, because the deal was THAT good.",
    ],
  },

  educational: {
    label: "Educational / Tutorial",
    description:
      "Teaching, informing, and empowering — application tips, lash care, styling advice, and common mistake fixes. Position the speaker as a knowledgeable friend, not a lecturer. Every tip should be immediately actionable.",
    focusAreas: [
      "Step-by-step lash application: measuring, trimming, glue application, placement technique",
      "The 'look down into a mirror' trick for perfect placement every time",
      "How to choose the right CocoLash style for your eye shape (almond, round, hooded, monolid)",
      "Lash care and maintenance — cleaning, storing in the case, maximizing the 25+ wears",
      "Common mistakes: too much glue, not waiting for it to get tacky, placing from center instead of inner corner",
      "Quick fixes: how to reattach a lifting corner, how to blend with mascara, how to layer for drama",
      "Time-saving hacks — the 3-minute application method",
    ],
    exampleHooks: [
      "Okay so you've been putting on your lashes wrong... let me help.",
      "The ONE trick that made my lash application take 2 minutes flat...",
      "Not sure which lash style suits your eye shape? Watch this.",
      "Three mistakes that are *ruining* your lash game...",
      "The hack that will change how you apply lashes forever...",
      "I used to STRUGGLE with lashes until I learned this...",
      "Your lashes keep lifting? Try this instead...",
      "How I went from 'lashes scare me' to applying them in 90 seconds...",
    ],
  },

  unboxing: {
    label: "Unboxing",
    description:
      "First-look, unboxing experience — ASMR-adjacent, visual, tactile, and satisfying. The goal is to make the viewer FEEL the experience of receiving and opening CocoLash. Slow, deliberate, sensory-rich. Let the packaging speak for itself.",
    focusAreas: [
      "The shipping package arrival — the anticipation, the branded packaging, the care in presentation",
      "The box itself — magnetic closure, the weight, the design, any tissue paper or inserts",
      "First tactile impression — lifting the lashes out, feeling the fibers, examining the band",
      "What's included — the lash pair, the case, any tools, a thank-you card, brand touches",
      "The satisfying reveal moment — camera close-up, slow pull, the 'ooh' reaction",
      "Genuine first reaction — delight, surprise at quality, excitement to try them on",
    ],
    exampleHooks: [
      "My CocoLash order just arrived and I'm opening it live...",
      "The packaging alone... okay let's see what's inside.",
      "ASMR unboxing of the prettiest lashes I've ever ordered...",
      "New lash day hits different when the packaging looks like THIS...",
      "I ordered these blind and... *opens box* oh. my. GOD.",
      "Watch me unbox the lashes that broke TikTok...",
      "The unboxing experience is giving luxury and I'm here for it...",
      "Everything about this packaging screams 'you deserve this'...",
    ],
  },

  "before-after": {
    label: "Before & After",
    description:
      "Transformation content — showing the dramatic difference CocoLash lashes make. The power is in the contrast. The 'before' should be relatable and vulnerable; the 'after' should be a genuine glow-up moment that makes the viewer think 'I NEED that.'",
    focusAreas: [
      "The bare-lash 'before' — relatable, no-makeup or minimal-makeup look, embracing the natural face",
      "The application moment — show how quick and easy it is, real-time or sped up",
      "The 'after' reveal — dramatic camera change, different angle, or slow turn to show the full effect",
      "The reaction — genuine surprise or delight at the transformation, even if she's done it before",
      "Side-by-side comparison — one eye with, one without, or split screen",
      "How the transformation makes her feel — the confidence boost, the 'main character' energy",
      "Time context — emphasize that this transformation took minutes, not hours",
    ],
    exampleHooks: [
      "From 'just woke up' to 'just stepped out of Vogue' in 3 minutes...",
      "This is my face without lashes... and THIS is my face with CocoLash.",
      "The glow up is REAL and it takes literally 5 minutes...",
      "Watch my eyes go from zero to *wow* with one product...",
      "Same girl, same face, same makeup... the ONLY thing I changed was adding these lashes.",
      "I want you to pay attention to my eyes... ready? Now watch THIS.",
      "The 3-minute transformation that has people asking what I got done...",
      "Before CocoLash vs after CocoLash... yeah, we're never going back.",
    ],
  },
};
