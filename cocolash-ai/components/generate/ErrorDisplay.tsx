"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, RefreshCw, ShieldAlert, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GenerateErrorResponse } from "@/lib/types";

interface ErrorDisplayProps {
  error: GenerateErrorResponse;
  onRetry: () => void;
}

const ERROR_CONFIG: Record<
  string,
  { icon: React.ElementType; title: string; color: string }
> = {
  SAFETY_BLOCK: {
    icon: ShieldAlert,
    title: "Content Safety Filter",
    color: "text-amber-600",
  },
  RATE_LIMITED: {
    icon: Clock,
    title: "Rate Limit Reached",
    color: "text-orange-600",
  },
  INVALID_API_KEY: {
    icon: Wifi,
    title: "API Configuration Error",
    color: "text-red-600",
  },
  TIMEOUT: {
    icon: Clock,
    title: "Request Timed Out",
    color: "text-orange-600",
  },
  default: {
    icon: AlertTriangle,
    title: "Generation Failed",
    color: "text-red-500",
  },
};

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle rate limit countdown
  useEffect(() => {
    if (error.code === "RATE_LIMITED" && error.retryAfterMs) {
      setCountdown(Math.ceil(error.retryAfterMs / 1000));
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [error.code, error.retryAfterMs]);

  const config = ERROR_CONFIG[error.code || ""] || ERROR_CONFIG.default;
  const Icon = config.icon;
  const isRateLimited = error.code === "RATE_LIMITED" && countdown !== null && countdown > 0;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50/50 p-6">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ${config.color}`}>
        <Icon className="h-6 w-6" />
      </div>

      <div className="text-center">
        <h3 className="text-base font-semibold text-coco-brown">
          {config.title}
        </h3>
        <p className="mt-1 text-sm text-coco-brown-medium">
          {error.error}
        </p>
      </div>

      {isRateLimited && (
        <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-orange-600 shadow-sm">
          <Clock className="h-4 w-4" />
          Retry in {countdown}s
        </div>
      )}

      <Button
        variant="outline"
        onClick={onRetry}
        disabled={isRateLimited}
        className="gap-2 border-coco-brown-medium/20"
      >
        <RefreshCw className="h-4 w-4" />
        {error.code === "SAFETY_BLOCK" ? "Try Different Settings" : "Try Again"}
      </Button>
    </div>
  );
}
