"use client";

import type { SeedanceEngine } from "@/lib/types";
import type { SeedanceV4Mode } from "./types";
import { capabilityFor } from "./lib/mode-capabilities";

interface CapabilityCardProps {
  mode: SeedanceV4Mode | "text_to_video";
  /** The engine the wizard is on. Some modes behave differently on 2.5
   *  (multi_frame accepts references there) and the copy has to follow. */
  engine?: SeedanceEngine;
}

export function CapabilityCard({ mode, engine }: CapabilityCardProps) {
  const cap = capabilityFor(mode, engine);
  if (!cap) return null;

  return (
    <section className="mb-6 rounded-xl border-2 border-coco-beige-dark bg-coco-beige/30 p-4">
      <h3 className="mb-2 text-sm font-bold text-coco-brown">
        What this mode does
      </h3>
      <dl className="space-y-1.5 text-xs text-coco-brown-medium">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-coco-brown">
            Inputs
          </dt>
          <dd>{cap.inputs}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-coco-brown">
            Best for
          </dt>
          <dd>{cap.bestFor}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-coco-brown">
            Limits
          </dt>
          <dd>{cap.limits}</dd>
        </div>
      </dl>
    </section>
  );
}
