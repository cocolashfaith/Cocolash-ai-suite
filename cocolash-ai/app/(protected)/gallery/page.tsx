import { Images } from "lucide-react";

/**
 * Gallery Page — Browse and manage generated images.
 * Placeholder for Phase 1.6 (Step 25).
 */
export default function GalleryPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
        <Images className="h-8 w-8 text-coco-golden" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-coco-brown">Gallery</h1>
      <p className="mt-2 text-sm text-coco-brown-medium">
        The image gallery will be built in Phase 1.6.
      </p>
    </div>
  );
}
