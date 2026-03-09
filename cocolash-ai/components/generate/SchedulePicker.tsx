"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  onQuickNow: () => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function SchedulePicker({
  value,
  onChange,
  onQuickNow,
}: SchedulePickerProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? now.getMonth());
  const [hour, setHour] = useState(value?.getHours() ?? 11);
  const [minute, setMinute] = useState(value?.getMinutes() ?? 0);

  const lastSyncedMs = useRef(value?.getTime() ?? 0);
  useEffect(() => {
    const ms = value?.getTime() ?? 0;
    if (value && ms !== lastSyncedMs.current) {
      setHour(value.getHours());
      setMinute(value.getMinutes());
      setViewYear(value.getFullYear());
      setViewMonth(value.getMonth());
    }
    lastSyncedMs.current = ms;
  }, [value]);

  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{ day: number; inMonth: boolean; date: Date }> = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      cells.push({ day: d, inMonth: false, date: new Date(viewYear, viewMonth - 1, d) });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, inMonth: true, date: new Date(viewYear, viewMonth, d) });
    }
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, inMonth: false, date: new Date(viewYear, viewMonth + 1, d) });
      }
    }
    return cells;
  }, [viewYear, viewMonth]);

  const selectedDateStr = value
    ? `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
    : null;

  const isPast = (d: Date) => {
    const comp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return comp < today;
  };

  const selectDay = (d: Date) => {
    if (isPast(d)) return;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
    onChange(next);
  };

  const updateTime = (h: number, m: number) => {
    const base = value ?? new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    onChange(next);
  };

  const incrementHour = (dir: 1 | -1) => {
    const h = ((hour + dir) + 24) % 24;
    setHour(h);
    if (value) updateTime(h, minute);
  };

  const incrementMinute = (dir: 1 | -1) => {
    const m = ((minute + dir * 5) + 60) % 60;
    setMinute(m);
    if (value) updateTime(hour, m);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const setTomorrow7pm = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    setHour(19);
    setMinute(0);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    onChange(d);
  };

  const formatHour12 = (h: number) => {
    const h12 = h % 12 || 12;
    return String(h12).padStart(2, "0");
  };

  const isPM = hour >= 12;
  const toggleAMPM = () => {
    const h = isPM ? hour - 12 : hour + 12;
    setHour(h);
    if (value) updateTime(h, minute);
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold text-coco-brown">
        When to publish
      </label>

      <div className="rounded-xl border border-coco-beige-dark bg-white">
        {/* Calendar header */}
        <div className="flex items-center justify-between border-b border-coco-beige-dark px-4 py-2.5">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-md p-1 text-coco-brown-medium hover:bg-coco-beige/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-coco-brown">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-md p-1 text-coco-brown-medium hover:bg-coco-beige/60"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex">
          {/* Calendar grid */}
          <div className="flex-1 px-3 py-2">
            <div className="mb-1 grid grid-cols-7 text-center">
              {DAY_LABELS.map((d, i) => (
                <span key={i} className="py-1 text-[10px] font-medium text-coco-brown-medium/50">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 text-center">
              {calendarDays.map((cell, i) => {
                const dateStr = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
                const isSelected = dateStr === selectedDateStr;
                const isToday = dateStr === todayStr;
                const past = isPast(cell.date);

                return (
                  <button
                    key={i}
                    type="button"
                    disabled={past}
                    onClick={() => selectDay(cell.date)}
                    className={cn(
                      "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-all",
                      !cell.inMonth && "text-coco-brown-medium/25",
                      cell.inMonth && !isSelected && !isToday && !past && "text-coco-brown hover:bg-coco-golden/10",
                      isToday && !isSelected && "font-bold text-coco-golden",
                      isSelected && "bg-coco-golden font-bold text-white shadow-sm",
                      past && "cursor-not-allowed text-coco-brown-medium/20"
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time picker */}
          <div className="flex flex-col items-center justify-center gap-1 border-l border-coco-beige-dark px-3 py-2">
            {/* Hour */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => incrementHour(1)} className="rounded p-0.5 text-coco-brown-medium/50 hover:text-coco-brown">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <span className="flex h-8 w-9 items-center justify-center rounded-lg bg-coco-golden/10 text-sm font-bold text-coco-brown">
                {formatHour12(hour)}
              </span>
              <button type="button" onClick={() => incrementHour(-1)} className="rounded p-0.5 text-coco-brown-medium/50 hover:text-coco-brown">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <span className="text-xs font-bold text-coco-brown-medium/40">:</span>

            {/* Minute */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => incrementMinute(1)} className="rounded p-0.5 text-coco-brown-medium/50 hover:text-coco-brown">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <span className="flex h-8 w-9 items-center justify-center rounded-lg bg-coco-golden/10 text-sm font-bold text-coco-brown">
                {String(minute).padStart(2, "0")}
              </span>
              <button type="button" onClick={() => incrementMinute(-1)} className="rounded p-0.5 text-coco-brown-medium/50 hover:text-coco-brown">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* AM/PM */}
            <button
              type="button"
              onClick={toggleAMPM}
              className="mt-1 rounded-md bg-coco-beige px-2.5 py-1 text-[10px] font-bold text-coco-brown transition-colors hover:bg-coco-beige-dark"
            >
              {isPM ? "PM" : "AM"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick buttons + timezone */}
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1 text-[10px] text-coco-brown-medium/40">
          <Clock className="h-3 w-3" />
          {tz}
        </p>
        <div className="ml-auto flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { onQuickNow(); }}
            className="h-6 border-coco-beige-dark px-2.5 text-[10px] text-coco-brown-medium hover:bg-coco-beige/60"
          >
            Now
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setTomorrow7pm}
            className="h-6 border-coco-beige-dark px-2.5 text-[10px] text-coco-brown-medium hover:bg-coco-beige/60"
          >
            Tomorrow 7 PM
          </Button>
        </div>
      </div>
    </div>
  );
}
