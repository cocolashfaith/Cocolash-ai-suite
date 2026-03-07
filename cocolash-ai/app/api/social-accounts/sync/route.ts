import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlotatoClient } from "@/lib/blotato/client";
import { BlotatoError } from "@/lib/blotato/types";

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: settings } = await supabase
      .from("caption_settings")
      .select("blotato_api_key")
      .limit(1);

    const blotatoKey =
      settings?.[0]?.blotato_api_key || process.env.BLOTATO_API_KEY;

    if (!blotatoKey) {
      return NextResponse.json(
        { error: "Blotato API key not configured" },
        { status: 400 }
      );
    }

    const client = createBlotatoClient(blotatoKey);
    const accounts = await client.getAccounts();

    const now = new Date().toISOString();

    await supabase
      .from("social_accounts")
      .update({ is_active: false })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (accounts.length > 0) {
      const upserts = accounts.map((a) => ({
        blotato_account_id: a.id,
        platform: a.platform,
        account_name: a.fullname || null,
        account_handle: a.username || null,
        is_active: true,
        last_synced_at: now,
      }));

      await supabase
        .from("social_accounts")
        .upsert(upserts, { onConflict: "blotato_account_id" });
    }

    const { data: refreshed } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("is_active", true)
      .order("platform");

    return NextResponse.json({
      accounts: refreshed ?? [],
      synced_at: now,
      count: refreshed?.length ?? 0,
    });
  } catch (error: unknown) {
    console.error("[social-accounts/sync] Error:", error);
    const message =
      error instanceof BlotatoError
        ? error.message
        : "Failed to sync accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
