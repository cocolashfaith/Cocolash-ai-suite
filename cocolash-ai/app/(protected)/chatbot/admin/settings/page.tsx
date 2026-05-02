import { createAdminClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function ChatbotAdminSettings() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("chat_settings")
    .select("bot_enabled, daily_cap_usd, default_top_k, system_prompt_version, embedding_model, updated_at")
    .single();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Settings</h1>
      <p className="text-sm text-coco-brown-medium">
        Kill switch, daily spend cap, retrieval depth, prompt version. Embedding model is read-only — changing it requires re-embedding the corpus.
      </p>
      <SettingsForm
        initial={{
          bot_enabled: !!data?.bot_enabled,
          daily_cap_usd: Number(data?.daily_cap_usd ?? 50),
          default_top_k: Number(data?.default_top_k ?? 6),
          system_prompt_version: String(data?.system_prompt_version ?? "v1.0.0"),
          embedding_model: String(data?.embedding_model ?? "text-embedding-3-small"),
          updated_at: String(data?.updated_at ?? ""),
        }}
      />
    </div>
  );
}
