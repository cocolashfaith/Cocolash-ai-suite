"use client";

/**
 * Full-screen zoomable image viewer (2026-09-18, Harry's ask): click a
 * generated image to inspect it in detail — wheel / buttons / double-click
 * to zoom, drag to pan, Esc or backdrop click to close. No dependencies.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

export function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => clampScale(s * factor));
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Esc closes; +/- zoom.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-") zoomBy(0.8);
      else if (e.key === "0") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomBy, reset]);

  // Wheel zoom needs a NON-passive listener (React's synthetic wheel can't
  // preventDefault reliably), so the page behind never scrolls.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset({
      x: d.baseX + (e.clientX - d.startX),
      y: d.baseY + (e.clientY - d.startY),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Zoomed view: ${alt}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onClick={(e) => {
        // Backdrop click closes; clicks on the image/toolbar do not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-end gap-1 p-3">
        <span className="mr-2 text-xs font-medium text-white/70">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(0.8)}
          className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.25)}
          className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={reset}
          className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ml-2 rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={stageRef}
        className="flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() =>
            scale === 1 ? setScale(2.5) : reset()
          }
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          className="max-h-full max-w-full cursor-grab select-none object-contain active:cursor-grabbing"
        />
      </div>
    </div>
  );
}
