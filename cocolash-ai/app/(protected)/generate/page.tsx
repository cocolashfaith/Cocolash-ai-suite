import { Sparkles } from "lucide-react";

/**
 * Generate Page — Main image generation interface.
 * Placeholder for Phase 1.6 (Step 20-22).
 */
export default function GeneratePage() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
        <Sparkles className="h-8 w-8 text-coco-golden" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-coco-brown">
        Generate Images
      </h1>
      <p className="mt-2 text-sm text-coco-brown-medium">
        The image generation interface will be built in Phase 1.6.
      </p>
    </div>
  );
}
