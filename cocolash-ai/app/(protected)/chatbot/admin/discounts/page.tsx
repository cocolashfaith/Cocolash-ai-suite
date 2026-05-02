import { createAdminClient } from "@/lib/supabase/server";
import { DiscountsTable } from "./discounts-table";

interface DiscountRow {
  id: string;
  code: string;
  value: number;
  value_type: "percentage" | "fixed_amount";
  discount_class: "order" | "product" | "shipping";
  status: "active" | "paused" | "expired";
  times_used: number;
  usage_limit_per_code: number | null;
  campaign_window: string | null;
  intent_triggers: string[] | null;
  product_line_scope: string[] | null;
}

export default async function ChatbotAdminDiscounts() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("discount_rules")
    .select("id, code, value, value_type, discount_class, status, times_used, usage_limit_per_code, campaign_window, intent_triggers, product_line_scope")
    .order("status", { ascending: true })
    .order("code", { ascending: true });

  const rows = (data ?? []) as DiscountRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Discounts</h1>
      <p className="text-sm text-coco-brown-medium">
        Coco only ever offers ONE code per turn. Add intent triggers (e.g. <code>lead_capture</code>)
        and product-line scope to control when each rule fires.
      </p>
      <p className="text-sm text-coco-brown-medium">
        To bulk-import the latest Shopify export run{" "}
        <code className="rounded bg-coco-beige px-1 py-0.5 font-mono">npx tsx scripts/discount-import.ts</code>.
      </p>
      <DiscountsTable rows={rows} />
    </div>
  );
}
