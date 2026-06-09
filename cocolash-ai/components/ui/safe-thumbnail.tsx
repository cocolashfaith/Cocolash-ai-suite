"use client";

import { Component, useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ImageLoader } from "@/components/ui/image-loader";

/**
 * A thumbnail that can NEVER crash its parent page.
 *
 * next/image throws synchronously during render when the src host is not
 * configured in next.config `images.remotePatterns`. A single such throw would
 * white-screen the entire gallery (this happened: a completed Seedance video's
 * thumbnail fell back to an Enhancor CloudFront URL that wasn't whitelisted).
 *
 * Two failure modes are isolated to the one image:
 *   1. Render throw (unconfigured host)  → caught by the error boundary.
 *   2. Network load failure (e.g. 401)   → caught by <Image onError>.
 * Either way we show `fallback` instead of breaking the page.
 */

interface SafeThumbnailProps {
  src: string;
  alt: string;
  eager?: boolean;
  /** Applied to the <Image> (object-fit, hover transforms, etc). */
  imageClassName?: string;
  /** Rendered in place of the image on any failure. */
  fallback: ReactNode;
}

class ImageThrowBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ThumbnailInner({
  src,
  alt,
  eager = false,
  imageClassName,
  fallback,
}: SafeThumbnailProps): ReactNode {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) return fallback;

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center">
          <ImageLoader />
        </div>
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        className={cn(imageClassName, loaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
    </>
  );
}

export function SafeThumbnail(props: SafeThumbnailProps): ReactNode {
  return (
    <ImageThrowBoundary fallback={props.fallback}>
      <ThumbnailInner {...props} />
    </ImageThrowBoundary>
  );
}
