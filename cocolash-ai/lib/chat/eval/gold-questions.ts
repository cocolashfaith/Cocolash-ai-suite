/**
 * lib/chat/eval/gold-questions.ts — 50-question gold set for chatbot eval.
 *
 * Drawn directly from public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md
 * §1 (FAQ) and §2 (product catalog), plus paraphrases that simulate how
 * customers actually ask. Each row carries:
 *
 *   - expected_chunk_ids: the chunk source_ids that retrieval MUST return
 *     in the top-K. We accept ANY of the listed IDs as a hit so paraphrased
 *     questions can match either the FAQ chunk or a product chunk.
 *   - must_contain: case-insensitive substrings the answer should contain.
 *   - must_not_contain: brand-voice violations (urgency, pet names, etc.).
 *   - expected_intent: optional ground-truth label for intent_accuracy metric.
 *
 * If you change a chunk's source_id slug in scripts/chat-ingest.ts, update
 * expected_chunk_ids here.
 */

import type { IntentLabel } from "../types";

export interface GoldQuestion {
  id: string;
  question: string;
  expected_topic: string;
  expected_chunk_ids: ReadonlyArray<string>;
  must_contain: ReadonlyArray<string>;
  must_not_contain: ReadonlyArray<string>;
  expected_intent?: IntentLabel;
}

// Common brand-voice violations to grep across every answer.
const VOICE_VIOLATIONS_GLOBAL: ReadonlyArray<string> = [
  "limited time",
  "selling out",
  "hurry",
  "only 2 left",
  "babe",
  "hun",
  "act now",
  "safe for sensitive eyes",
];

const v = (extra: ReadonlyArray<string> = []): ReadonlyArray<string> => [
  ...VOICE_VIOLATIONS_GLOBAL,
  ...extra,
];

export const GOLD_QUESTIONS: ReadonlyArray<GoldQuestion> = [
  // ── FAQ — Product Information ───────────────────────────────
  {
    id: "g-001",
    question: "What are CocoLash lash extensions?",
    expected_topic: "product-info",
    expected_chunk_ids: ["faq:product-information:what-are-cocolash-lash-extensions"],
    must_contain: ["DIY", "home"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-002",
    question: "What's in the CocoLash Kit?",
    expected_topic: "product-kit",
    expected_chunk_ids: [
      "faq:product-information:what-s-included-in-the-cocolash-kit",
      "product_md:lash-essentials-kit",
    ],
    must_contain: ["adhesive", "sealant"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-003",
    question: "How many lash clusters are in a set?",
    expected_topic: "product-info",
    expected_chunk_ids: ["faq:product-information:how-many-lash-clusters-are-included-in-each-set"],
    must_contain: ["6", "3"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-004",
    question: "Are CocoLash products cruelty-free?",
    expected_topic: "ethics",
    expected_chunk_ids: ["faq:product-information:are-cocolash-products-cruelty-free"],
    must_contain: ["cruelty-free", "faux mink"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-005",
    question: "Can I reuse the lashes?",
    expected_topic: "reuse",
    expected_chunk_ids: ["faq:product-information:are-cocolash-lashes-reusable"],
    must_contain: ["7 days", "single-use"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-006",
    question: "What styles do you have?",
    expected_topic: "styles",
    expected_chunk_ids: ["faq:product-information:what-styles-are-available"],
    must_contain: ["Violet", "Dahlia"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-007",
    question: "Will lashes work with glasses?",
    expected_topic: "glasses",
    expected_chunk_ids: ["faq:product-information:can-i-wear-cocolash-lashes-with-glasses"],
    must_contain: ["Violet", "Jasmine"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-008",
    question: "What is the difference between Classic and Volume?",
    expected_topic: "comparison",
    expected_chunk_ids: ["faq:product-information:what-s-the-difference-between-classic-and-volume-lashes"],
    must_contain: ["Classic", "Volume", "$12", "$14"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-009",
    question: "What is Subscribe & Save?",
    expected_topic: "subscribe",
    expected_chunk_ids: ["faq:product-information:what-is-subscribe-save"],
    must_contain: ["$24.50", "monthly"],
    must_not_contain: v(),
    expected_intent: "product",
  },

  // ── FAQ — Application & Care ────────────────────────────────
  {
    id: "g-010",
    question: "How do I apply CocoLash?",
    expected_topic: "application",
    expected_chunk_ids: ["faq:application-care:how-do-i-apply-cocolash-lash-extensions"],
    must_contain: ["bond", "applicator"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-011",
    question: "I'm a total beginner — is this hard to do?",
    expected_topic: "beginner",
    expected_chunk_ids: ["faq:application-care:i-m-a-beginner-is-this-hard-to-do"],
    must_contain: ["pre-fanned", "outer corner"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-012",
    question: "How long do they last?",
    expected_topic: "wear-time",
    expected_chunk_ids: ["faq:application-care:how-long-do-cocolash-lashes-last"],
    must_contain: ["7 days"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-013",
    question: "How do I take the lashes off?",
    expected_topic: "removal",
    expected_chunk_ids: ["faq:application-care:how-do-i-remove-my-cocolash-lashes"],
    must_contain: ["remover", "1", "2 minutes"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-014",
    question: "Will these damage my real lashes?",
    expected_topic: "damage",
    expected_chunk_ids: ["faq:application-care:will-lash-extensions-damage-my-natural-lashes"],
    must_contain: ["latex-free"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-015",
    question: "Any tips for making them last longer?",
    expected_topic: "care",
    expected_chunk_ids: ["faq:application-care:how-do-i-care-for-my-lashes-to-make-them-last-longer"],
    must_contain: ["oil-based"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-016",
    question: "Can I shower with them on?",
    expected_topic: "water",
    expected_chunk_ids: ["faq:application-care:can-i-shower-or-swim-with-my-lashes-on"],
    must_contain: ["24"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-017",
    question: "Are the ingredients safe for sensitive skin?",
    expected_topic: "ingredients",
    expected_chunk_ids: ["faq:application-care:what-ingredients-are-in-the-cocolash-adhesive-is-it-safe-for-sensitive-eyes"],
    must_contain: ["latex-free", "patch test"],
    // Note: the model must NOT use "safe for sensitive eyes" verbatim —
    // it should reference the ingredient profile + recommend a patch test.
    must_not_contain: v(["safe for sensitive eyes"]),
    expected_intent: "product",
  },
  {
    id: "g-018",
    question: "Can I wear makeup with my lash extensions?",
    expected_topic: "makeup",
    expected_chunk_ids: ["faq:application-care:can-i-wear-makeup-with-my-lash-extensions"],
    must_contain: ["oil-based", "micellar"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-019",
    question: "How do I store the kit between uses?",
    expected_topic: "storage",
    expected_chunk_ids: ["faq:application-care:how-do-i-store-my-lash-kit-between-applications"],
    must_contain: ["cool", "dry"],
    must_not_contain: v(),
    expected_intent: "product",
  },

  // ── FAQ — Orders & Shipping ─────────────────────────────────
  {
    id: "g-020",
    question: "How do I place an order?",
    expected_topic: "ordering",
    expected_chunk_ids: ["faq:orders-shipping:how-do-i-place-an-order"],
    must_contain: ["cocolash.com"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-021",
    question: "Can I cancel my order?",
    expected_topic: "cancel",
    expected_chunk_ids: ["faq:orders-shipping:can-i-modify-or-cancel-my-order-after-placing-it"],
    must_contain: ["24 hours", "support@cocolash.com"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-022",
    question: "What are the shipping options?",
    expected_topic: "shipping",
    expected_chunk_ids: ["faq:orders-shipping:what-are-the-shipping-options-and-costs"],
    must_contain: ["$50", "5", "7"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-023",
    question: "Do you ship to Canada?",
    expected_topic: "international",
    expected_chunk_ids: ["faq:orders-shipping:do-you-ship-internationally"],
    must_contain: ["United States"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-024",
    question: "How do I track my package?",
    expected_topic: "tracking",
    expected_chunk_ids: ["faq:orders-shipping:how-do-i-track-my-order"],
    must_contain: ["tracking number"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-025",
    question: "Do you do bundle deals?",
    expected_topic: "bundles",
    expected_chunk_ids: ["faq:orders-shipping:do-you-offer-bundle-discounts"],
    must_contain: ["3"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-026",
    question: "How does the subscription pricing work?",
    expected_topic: "subscribe",
    expected_chunk_ids: ["faq:orders-shipping:how-does-subscribe-save-pricing-work"],
    must_contain: ["$24.50"],
    must_not_contain: v(),
    expected_intent: "product",
  },

  // ── FAQ — Returns & Support ─────────────────────────────────
  {
    id: "g-027",
    question: "What's your return policy?",
    expected_topic: "returns",
    expected_chunk_ids: ["faq:returns-support:what-is-your-return-policy"],
    must_contain: ["30 days", "support@cocolash.com"],
    must_not_contain: v(),
    expected_intent: "order",
  },
  {
    id: "g-028",
    question: "My order arrived damaged",
    expected_topic: "damaged",
    expected_chunk_ids: ["faq:returns-support:what-if-i-receive-a-damaged-or-incorrect-item"],
    must_contain: ["7 days", "support@cocolash.com"],
    must_not_contain: v(),
    expected_intent: "support",
  },
  {
    id: "g-029",
    question: "How can I reach support?",
    expected_topic: "contact",
    expected_chunk_ids: ["faq:returns-support:how-can-i-contact-customer-support"],
    must_contain: ["support@cocolash.com"],
    must_not_contain: v(),
    expected_intent: "support",
  },
  {
    id: "g-030",
    question: "How do I cancel my subscription?",
    expected_topic: "cancel-sub",
    expected_chunk_ids: ["faq:returns-support:how-do-i-cancel-my-subscribe-save-subscription"],
    must_contain: ["pause", "cancel"],
    must_not_contain: v(),
    expected_intent: "order",
  },

  // ── Product catalog questions ───────────────────────────────
  {
    id: "g-031",
    question: "Tell me about Violet",
    expected_topic: "product:violet",
    expected_chunk_ids: ["product_md:violet", "product_csv:violet-subtle-charm"],
    must_contain: ["Cat Eye"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-032",
    question: "What does Dahlia look like?",
    expected_topic: "product:dahlia",
    expected_chunk_ids: ["product_md:dahlia", "product_csv:dahlia-lash-extensions"],
    must_contain: ["Fox Eye"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-033",
    question: "Is Peony a natural look?",
    expected_topic: "product:peony",
    expected_chunk_ids: ["product_md:peony"],
    must_contain: ["Doll Eye", "Natural"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-034",
    question: "Compare Iris and Orchid",
    expected_topic: "comparison",
    expected_chunk_ids: ["product_md:iris", "product_md:orchid"],
    must_contain: ["Fox Eye"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-035",
    question: "What's the warmest tone option?",
    expected_topic: "tones",
    expected_chunk_ids: ["product_md:sorrel", "product_md:marigold"],
    must_contain: ["warm"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-036",
    question: "I want romantic and bold",
    expected_topic: "product:rose",
    expected_chunk_ids: ["product_md:rose"],
    must_contain: ["Rose"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-037",
    question: "How much is Jasmine?",
    expected_topic: "price",
    expected_chunk_ids: ["product_md:jasmine"],
    must_contain: ["$12", "$35"],
    must_not_contain: v(),
    expected_intent: "product",
  },

  // ── Recommendation / discovery ──────────────────────────────
  {
    id: "g-038",
    question: "I want something subtle for everyday",
    expected_topic: "recommend-natural",
    expected_chunk_ids: ["product_md:violet", "product_md:peony", "product_md:jasmine", "product_md:daisy"],
    must_contain: ["natural"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-039",
    question: "What's best for a wedding or special event?",
    expected_topic: "recommend-event",
    expected_chunk_ids: ["product_md:dahlia", "product_md:rose", "product_md:orchid"],
    must_contain: ["volume"],
    must_not_contain: v(),
    expected_intent: "product",
  },
  {
    id: "g-040",
    question: "Do you have something for hooded eyes?",
    expected_topic: "recommend-hooded",
    expected_chunk_ids: ["faq:product-information:can-i-wear-cocolash-lashes-with-glasses"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "product",
  },

  // ── Brand voice + escalation ────────────────────────────────
  {
    id: "g-041",
    question: "Hi!",
    expected_topic: "greeting",
    expected_chunk_ids: ["voice:chatbot-conversation-guidelines"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "other",
  },
  {
    id: "g-042",
    question: "I'm thinking of buying but I'm not sure yet",
    expected_topic: "lead-capture",
    expected_chunk_ids: ["voice:chatbot-conversation-guidelines"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "lead_capture",
  },
  {
    id: "g-043",
    question: "I bought lashes a week ago and they fell off in 2 days, this is unacceptable",
    expected_topic: "complaint",
    expected_chunk_ids: ["faq:returns-support:how-can-i-contact-customer-support"],
    must_contain: ["support@cocolash.com"],
    must_not_contain: v(),
    expected_intent: "support",
  },
  {
    id: "g-044",
    question: "Can I get a discount?",
    expected_topic: "discount",
    expected_chunk_ids: ["voice:chatbot-conversation-guidelines"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "lead_capture",
  },
  {
    id: "g-045",
    question: "Do you ship to the EU?",
    expected_topic: "international",
    expected_chunk_ids: ["faq:orders-shipping:do-you-ship-internationally"],
    must_contain: ["United States"],
    must_not_contain: v(),
    expected_intent: "order",
  },

  // ── Try-on ──────────────────────────────────────────────────
  {
    id: "g-046",
    question: "Can I see how Violet looks on me?",
    expected_topic: "tryon",
    expected_chunk_ids: ["product_md:violet"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "tryon",
  },
  {
    id: "g-047",
    question: "Show me Poppy on my eyes",
    expected_topic: "tryon",
    expected_chunk_ids: ["product_md:poppy"],
    must_contain: [],
    must_not_contain: v(),
    expected_intent: "tryon",
  },

  // ── Out-of-scope (don't-know flow) ──────────────────────────
  {
    id: "g-048",
    question: "Can you book me a salon appointment?",
    expected_topic: "out-of-scope",
    expected_chunk_ids: [],
    must_contain: ["team"],
    must_not_contain: v(),
    expected_intent: "lead_capture",
  },
  {
    id: "g-049",
    question: "What's your CEO's email?",
    expected_topic: "out-of-scope",
    expected_chunk_ids: [],
    must_contain: ["support@cocolash.com"],
    must_not_contain: v(["Faith"]),
    expected_intent: "support",
  },

  // ── Brand-voice trap (medical claim probe) ──────────────────
  {
    id: "g-050",
    question: "Are these safe for sensitive eyes?",
    expected_topic: "ingredients",
    expected_chunk_ids: ["faq:application-care:what-ingredients-are-in-the-cocolash-adhesive-is-it-safe-for-sensitive-eyes"],
    must_contain: ["latex-free", "patch test"],
    must_not_contain: v(["safe for sensitive eyes"]),
    expected_intent: "product",
  },
];

/** Total count is asserted by the eval runner so a typo can't silently shorten the set. */
export const GOLD_QUESTIONS_COUNT = GOLD_QUESTIONS.length;
