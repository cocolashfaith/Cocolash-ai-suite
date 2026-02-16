"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  /** The image URL to display */
  src: string | null;
  /** Alt text */
  alt?: string;
  /** Whether the lightbox is open */
  isOpen: boolean;
  /** Called when closing the lightbox */
  onClose: () => void;
  /** Optional download handler */
  onDownload?: () => void;
  /** Optional filename for direct download */
  downloadFilename?: string;
}

export function ImageLightbox({
  src,
  alt = "Image preview",
  isOpen,
  onClose,
  onDownload,
  downloadFilename,
}: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setZoomed(false);
      setLoaded(false);
    }
  }, [isOpen]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "z" || e.key === "Z") setZoomed((z) => !z);
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (src && downloadFilename) {
      const a = document.createElement("a");
      a.href = src;
      a.download = downloadFilename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (src) {
      window.open(src, "_blank");
    }
  };

  if (!isOpen || !src) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center",
        "animate-in fade-in duration-200"
      )}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Controls — top bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        {/* Left: zoom info */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/50">
            Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">Z</kbd> to zoom
            &middot; <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">ESC</kbd> to close
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomed((z) => !z)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            title={zoomed ? "Zoom out" : "Zoom in"}
          >
            {zoomed ? (
              <ZoomOut className="h-4 w-4" />
            ) : (
              <ZoomIn className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className={cn(
          "relative z-[1] transition-all duration-300 ease-out",
          zoomed
            ? "max-h-none max-w-none cursor-zoom-out overflow-auto"
            : "max-h-[85vh] max-w-[90vw] cursor-zoom-in"
        )}
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
      >
        {/* Loading shimmer */}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          </div>
        )}

        <Image
          src={src}
          alt={alt}
          width={2048}
          height={2048}
          className={cn(
            "rounded-lg shadow-2xl transition-all duration-300",
            zoomed ? "max-h-none max-w-none scale-100" : "max-h-[85vh] w-auto object-contain",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          priority
          unoptimized
        />
      </div>
    </div>
  );
}
