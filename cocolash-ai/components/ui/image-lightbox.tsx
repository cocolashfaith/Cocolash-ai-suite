"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import Image from "next/image";
import { X, Download, ZoomIn, ZoomOut, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLoader } from "@/components/ui/image-loader";

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
  const [downloading, setDownloading] = useState(false);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset all state when closing
  useEffect(() => {
    if (!isOpen) {
      setZoomed(false);
      setLoaded(false);
      setSpaceHeld(false);
      setIsPanning(false);
      setPanOffset({ x: 0, y: 0 });
      dragStart.current = null;
    }
  }, [isOpen]);

  // Keyboard handling — zoom, close, and space-to-pan
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "z" || e.key === "Z") {
        setZoomed((z) => {
          if (z) setPanOffset({ x: 0, y: 0 });
          return !z;
        });
      }
      if (e.key === " " && zoomed) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
        setIsPanning(false);
        dragStart.current = null;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isOpen, onClose, zoomed]);

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

  // Mouse handlers for pan-drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!zoomed || !spaceHeld) return;
      e.preventDefault();
      setIsPanning(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: panOffset.x,
        scrollY: panOffset.y,
      };
    },
    [zoomed, spaceHeld, panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanOffset({
        x: dragStart.current.scrollX + dx,
        y: dragStart.current.scrollY + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    dragStart.current = null;
  }, []);

  // Download via blob fetch (fixes cross-origin download issue)
  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!src) return;

    const filename =
      downloadFilename || `cocolash-image-${Date.now()}.png`;

    setDownloading(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("Fetch failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab if blob download fails
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  // Toggle zoom and reset pan
  const toggleZoom = () => {
    setZoomed((z) => {
      if (z) setPanOffset({ x: 0, y: 0 });
      return !z;
    });
  };

  if (!isOpen || !src) return null;

  // Determine cursor style based on state
  const getCursor = () => {
    if (zoomed && spaceHeld && isPanning) return "grabbing";
    if (zoomed && spaceHeld) return "grab";
    if (zoomed) return "zoom-out";
    return "zoom-in";
  };

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
        {/* Left: keyboard hints */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/50">
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">Z</kbd> zoom
            &middot; <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">ESC</kbd> close
            {zoomed && (
              <>
                &middot; hold{" "}
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/70">Space</kbd>{" "}
                + drag to pan
              </>
            )}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleZoom}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            title={zoomed ? "Zoom out (Z)" : "Zoom in (Z)"}
          >
            {zoomed ? (
              <ZoomOut className="h-4 w-4" />
            ) : (
              <ZoomIn className="h-4 w-4" />
            )}
          </button>
          {zoomed && (
            <button
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                spaceHeld
                  ? "bg-white/30 text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
              title="Hold Space + drag to pan"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Move className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20",
              downloading && "animate-pulse"
            )}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            title="Close (ESC)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image container — supports zoom + pan */}
      <div
        ref={containerRef}
        className={cn(
          "relative z-[1] select-none overflow-hidden transition-all duration-300 ease-out",
          zoomed
            ? "max-h-[100vh] max-w-[100vw]"
            : "max-h-[85vh] max-w-[90vw]"
        )}
        style={{ cursor: getCursor() }}
        onClick={(e) => {
          e.stopPropagation();
          // Only toggle zoom if not panning (i.e., space not held)
          if (!spaceHeld) toggleZoom();
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Loading animation — 3D scrolling text */}
        {!loaded && (
          <div className="flex min-h-[200px] min-w-[200px] items-center justify-center">
            <ImageLoader />
          </div>
        )}

        <Image
          src={src}
          alt={alt}
          width={2048}
          height={2048}
          className={cn(
            "rounded-lg shadow-2xl transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            !zoomed && "max-h-[85vh] w-auto object-contain"
          )}
          style={
            zoomed
              ? {
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                  maxHeight: "none",
                  maxWidth: "none",
                  transition: isPanning ? "none" : "transform 0.15s ease-out",
                }
              : undefined
          }
          onLoad={() => setLoaded(true)}
          priority
          unoptimized
          draggable={false}
        />
      </div>
    </div>
  );
}
