"use client";

/**
 * CocoLash Image Loader — 3D scrolling "Loading" text animation.
 * Used as a placeholder while images are loading in lightbox, preview, and gallery.
 */
export function ImageLoader() {
  const word = "Loading";
  const slots = 9;

  return (
    <div className="coco-image-loader">
      {Array.from({ length: slots }, (_, i) => (
        <div key={i} className="coco-lt">
          <span>{word}</span>
        </div>
      ))}
      <div className="coco-line" />
    </div>
  );
}
