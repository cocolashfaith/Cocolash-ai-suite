import fs from "node:fs/promises";
import path from "node:path";
import { getFullPromptRegistry } from "@/lib/ai/director/prompt-registry";
import { PromptsList } from "./prompts-list";

interface PromptEntryWithMeta {
  id: string;
  name: string;
  surface: string;
  model: string;
  filePath: string;
  text: string;
  /** Last-modified date of the source file (server-side stat). */
  lastModified: string | null;
  /** Token-ish character count for at-a-glance complexity. */
  charCount: number;
}

export const metadata = {
  title: "AI Prompts — Coco Admin",
};

export default async function ChatbotAdminPrompts() {
  const registry = getFullPromptRegistry();
  const enriched: PromptEntryWithMeta[] = await Promise.all(
    registry.map(async (entry) => {
      const lastModified = await statFileSafe(entry.filePath);
      return {
        ...entry,
        lastModified,
        charCount: entry.text.length,
      };
    })
  );

  // Sort: Director prompts first (mode-grouped), then chat, then everything else
  enriched.sort((a, b) => {
    const order = (id: string) => {
      if (id.startsWith("seedance-director-")) return 0;
      if (id === "nanobanana-last-frame-director") return 1;
      if (id.startsWith("chat-")) return 2;
      return 3;
    };
    const orderDiff = order(a.id) - order(b.id);
    return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-coco-brown">AI Prompts</h1>
        <p className="text-sm text-coco-brown-medium">
          Every AI system prompt the suite uses. Read-only. Source of truth lives
          in code under <code className="rounded bg-coco-beige px-1">lib/</code> —
          edit there, redeploy, and this view auto-reflects.
        </p>
        <p className="text-xs text-coco-brown-medium/70">
          {enriched.length} prompts registered. Director prompts power the
          mode-first Seedance flow on{" "}
          <code className="rounded bg-coco-beige px-1">/video</code>.
        </p>
      </header>
      <PromptsList prompts={enriched} />
    </div>
  );
}

async function statFileSafe(filePath: string): Promise<string | null> {
  try {
    // filePath in the registry is a relative path. Strip any " (...)" suffix.
    const cleanPath = filePath.split(" ")[0];
    const abs = path.resolve(process.cwd(), cleanPath);
    const stat = await fs.stat(abs);
    return stat.mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}
