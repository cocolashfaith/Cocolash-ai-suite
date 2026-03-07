"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock } from "lucide-react";

interface SchedulePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  onQuickNow: () => void;
}

export function SchedulePicker({
  value,
  onChange,
  onQuickNow,
}: SchedulePickerProps) {
  const toLocalISO = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const dateValue = value ? toLocalISO(value) : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onChange(null);
      return;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) onChange(d);
  };

  const setTomorrow7pm = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    onChange(d);
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-coco-brown">
        When to publish
      </label>

      <div className="relative">
        <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
        <Input
          type="datetime-local"
          value={dateValue}
          onChange={handleChange}
          min={toLocalISO(new Date())}
          className="pl-9 text-sm"
        />
      </div>

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
            onClick={onQuickNow}
            className="h-6 px-2 text-[10px]"
          >
            Now
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setTomorrow7pm}
            className="h-6 px-2 text-[10px]"
          >
            Tomorrow 7 PM
          </Button>
        </div>
      </div>
    </div>
  );
}
