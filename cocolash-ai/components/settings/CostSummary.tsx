"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Video,
  Image,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface CostSummaryData {
  month: string;
  totalCost: number;
  videoCount: number;
  avgCostPerVideo: number;
  breakdown: {
    videos: number;
    images: number;
    captions: number;
  };
}

export function CostSummary() {
  const [data, setData] = useState<CostSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const fetchCosts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/costs?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setMonth(newMonth);
    setYear(newYear);
  };

  const isCurrentMonth =
    year === new Date().getFullYear() &&
    month === new Date().getMonth() + 1;

  return (
    <div className="rounded-2xl border border-coco-beige-dark bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100">
            <DollarSign className="h-4.5 w-4.5 text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-coco-brown">
              API Cost Tracker
            </h3>
            <p className="text-xs text-coco-brown-medium/50">
              Monthly usage across all AI services
            </p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="rounded-lg p-1.5 text-coco-brown-medium/40 transition-colors hover:bg-coco-beige-light hover:text-coco-brown"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[120px] text-center text-xs font-medium text-coco-brown">
            {data?.month ?? "..."}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
            className="rounded-lg p-1.5 text-coco-brown-medium/40 transition-colors hover:bg-coco-beige-light hover:text-coco-brown disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/30" />
        </div>
      ) : data ? (
        <div className="mt-5 space-y-4">
          {/* Total */}
          <div className="flex items-end justify-between rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 p-4">
            <div>
              <p className="text-xs text-green-600/70">Total Spend</p>
              <p className="text-2xl font-bold text-green-700">
                ${data.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-600/70">Videos Generated</p>
              <p className="text-lg font-semibold text-green-700">
                {data.videoCount}
              </p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <BreakdownCard
              icon={Video}
              label="Videos"
              cost={data.breakdown.videos}
              color="purple"
            />
            <BreakdownCard
              icon={Image}
              label="Images"
              cost={data.breakdown.images}
              color="blue"
            />
            <BreakdownCard
              icon={MessageSquare}
              label="Captions"
              cost={data.breakdown.captions}
              color="amber"
            />
          </div>

          {/* Avg per video */}
          {data.videoCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-coco-beige-light/50 px-3 py-2">
              <TrendingUp className="h-3.5 w-3.5 text-coco-brown-medium/40" />
              <p className="text-xs text-coco-brown-medium/60">
                Average cost per video:{" "}
                <span className="font-semibold text-coco-brown">
                  ${data.avgCostPerVideo.toFixed(2)}
                </span>
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-center text-xs text-coco-brown-medium/40">
          Unable to load cost data.
        </p>
      )}
    </div>
  );
}

function BreakdownCard({
  icon: Icon,
  label,
  cost,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  cost: number;
  color: "purple" | "blue" | "amber";
}) {
  const colorMap = {
    purple: {
      bg: "bg-purple-50",
      icon: "text-purple-500",
      text: "text-purple-700",
    },
    blue: { bg: "bg-blue-50", icon: "text-blue-500", text: "text-blue-700" },
    amber: {
      bg: "bg-amber-50",
      icon: "text-amber-500",
      text: "text-amber-700",
    },
  };

  const c = colorMap[color];

  return (
    <div className={`rounded-xl ${c.bg} p-3`}>
      <Icon className={`h-3.5 w-3.5 ${c.icon}`} />
      <p className={`mt-1.5 text-sm font-bold ${c.text}`}>
        ${cost.toFixed(2)}
      </p>
      <p className="text-[10px] text-coco-brown-medium/50">{label}</p>
    </div>
  );
}
