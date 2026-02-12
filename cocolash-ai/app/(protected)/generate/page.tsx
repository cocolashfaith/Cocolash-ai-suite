import { GenerateForm } from "@/components/generate/GenerateForm";

/**
 * Generate Page — Main image generation interface.
 *
 * Two-column layout:
 *   Left: All selector controls (category, skin tone, lash style, etc.)
 *   Right: Preview area (placeholder → progress → result or error)
 */
export default function GeneratePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-coco-brown">
          Generate Images
        </h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Create brand-consistent, luxury lash imagery with AI
        </p>
      </div>
      <GenerateForm />
    </div>
  );
}
