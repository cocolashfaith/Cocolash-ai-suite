import { createAdminClient } from "@/lib/supabase/server";
import { VoiceForm } from "./voice-form";
import { DEFAULT_VOICE_FRAGMENTS } from "@/lib/chat/voice";
import type { VoiceFragments } from "@/lib/chat/types";

export default async function ChatbotAdminVoice() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("chat_settings")
    .select("voice_fragments")
    .single();

  const fragments = (data?.voice_fragments ?? DEFAULT_VOICE_FRAGMENTS) as VoiceFragments;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-coco-brown">Voice</h1>
      <p className="text-sm text-coco-brown-medium">
        Editable conversation fragments. Coco's locked rules (no urgency, no medical claims, etc.)
        are NOT shown here — those live in code and cannot be shadowed.
      </p>
      <VoiceForm initial={fragments} />
    </div>
  );
}
