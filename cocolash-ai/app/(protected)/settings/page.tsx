import { Settings } from "lucide-react";

/**
 * Settings Page — Brand profile management.
 * Placeholder for Phase 1.3 (Step 11).
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
        <Settings className="h-8 w-8 text-coco-golden" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-coco-brown">Settings</h1>
      <p className="mt-2 text-sm text-coco-brown-medium">
        Brand profile settings will be built in Phase 1.3.
      </p>
    </div>
  );
}
