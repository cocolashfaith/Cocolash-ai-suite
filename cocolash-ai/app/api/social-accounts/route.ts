import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlotatoClient } from "@/lib/blotato/client";
import { BlotatoError } from "@/lib/blotato/types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET() {
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
        { error: "Blotato API key not configured. Add it in Settings → Social Publishing." },
        { status: 400 }
      );
    }

    const { data: cached } = await supabase
      .from("social_accounts")
      .select("*")
      .eq("is_active", true)
      .order("platform");

    if (cached && cached.length > 0) {
      const lastSynced = new Date(cached[0].last_synced_at).getTime();
      if (Date.now() - lastSynced < CACHE_TTL_MS) {
        return NextResponse.json({ accounts: cached, cached: true });
      }
    }

    return await syncAndReturn(supabase, blotatoKey);
  } catch (error: unknown) {
    console.error("[social-accounts] GET error:", error);
    const message =
      error instanceof BlotatoError
        ? error.message
        : "Failed to fetch social accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function syncAndReturn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiKey: string
) {
  const client = createBlotatoClient(apiKey);
  const accounts = await client.getAccounts();

  if (accounts.length === 0) {
    return NextResponse.json({ accounts: [], cached: false });
  }

  const now = new Date().toISOString();

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

  const { data: refreshed } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("is_active", true)
    .order("platform");

  return NextResponse.json({ accounts: refreshed ?? [], cached: false });
}
