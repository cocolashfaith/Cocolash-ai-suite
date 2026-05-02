/**
 * Zod schema + type for lead-capture payloads.
 */

import { z } from "zod";

export const LeadPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  email: z
    .string()
    .min(3)
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"),
  consent: z.boolean(),
  intentAtCapture: z.string().max(50).optional(),
  discountOffered: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});

export type LeadPayload = z.infer<typeof LeadPayloadSchema>;
