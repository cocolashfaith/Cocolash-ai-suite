import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireChatAdmin } from "@/lib/chat/admin-auth";
import { ChatError } from "@/lib/chat/error";

export const runtime = "nodejs";

const ROW_COLUMNS =
  "id, code, value, value_type, discount_class, status, times_used, usage_limit_per_code, campaign_window, intent_triggers, product_line_scope";

// A discount value is stored with its CSV sign (the table renders Math.abs),
// so we don't constrain the sign — but it MUST be a finite, non-zero number.
// `.finite()` rejects NaN and ±Infinity (the data-corruption path).
const discountValue = z
  .number()
  .finite()
  .refine((n) => n !== 0, "Discount value must not be zero");

const DiscountUpdate = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "expired"]).optional(),
  // The offer itself is now editable from the admin UI (no code deploy / CSV
  // re-import needed) — Faith was promised promo codes "easy to update".
  value: discountValue.optional(),
  value_type: z.enum(["percentage", "fixed_amount"]).optional(),
  discount_class: z.enum(["order", "product", "shipping"]).optional(),
  intent_triggers: z.array(z.string()).nullable().optional(),
  product_line_scope: z.array(z.string()).nullable().optional(),
  usage_limit_per_code: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const DiscountCreate = z.object({
  code: z.string().trim().min(1).max(64),
  value: discountValue,
  value_type: z.enum(["percentage", "fixed_amount"]),
  discount_class: z.enum(["order", "product", "shipping"]),
  status: z.enum(["active", "paused", "expired"]).default("active"),
  intent_triggers: z.array(z.string()).nullable().optional(),
  product_line_scope: z.array(z.string()).nullable().optional(),
  usage_limit_per_code: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function errorResponse(err: unknown): Response {
  if (err instanceof ChatError) {
    return Response.json({ error: err.code }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return Response.json(
      { error: "validation_failed", message: err.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  const isDuplicate = /duplicate key|unique constraint/i.test(message);
  return Response.json(
    {
      error: isDuplicate ? "duplicate_code" : "request_failed",
      message: isDuplicate
        ? "A discount with that code already exists."
        : message,
    },
    { status: isDuplicate ? 409 : 500 }
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const body = DiscountUpdate.parse(await req.json());
    const { id, ...patch } = body;
    const { error } = await supabase.from("discount_rules").update(patch).eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireChatAdmin(supabase);
    const body = DiscountCreate.parse(await req.json());
    const { data, error } = await supabase
      .from("discount_rules")
      .insert(body)
      .select(ROW_COLUMNS)
      .single();
    if (error) throw error;
    return Response.json({ ok: true, row: data });
  } catch (err) {
    return errorResponse(err);
  }
}
