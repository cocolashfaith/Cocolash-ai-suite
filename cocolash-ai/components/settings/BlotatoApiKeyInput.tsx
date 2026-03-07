"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
  Link2,
} from "lucide-react";

interface BlotatoApiKeyInputProps {
  initialKey?: string;
  onConnected?: (accountCount: number) => void;
}

export function BlotatoApiKeyInput({
  initialKey,
  onConnected,
}: BlotatoApiKeyInputProps) {
  const [apiKey, setApiKey] = useState(initialKey || "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<
    { type: "success"; accounts: number } | { type: "error"; message: string } | null
  >(null);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) return;

    setTesting(true);
    setStatus(null);

    try {
      const res = await fetch("/api/settings/blotato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: data.error || "Connection failed" });
        return;
      }

      setStatus({ type: "success", accounts: data.accounts_found });
      onConnected?.(data.accounts_found);
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-coco-golden" />
        <h4 className="text-sm font-semibold text-coco-brown">
          Blotato API Key
        </h4>
        {status?.type === "success" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="h-3.5 w-3.5" />
            Connected
          </span>
        )}
      </div>

      <p className="text-xs text-coco-brown-medium">
        Enter your Blotato API key to enable cross-platform publishing.{" "}
        <a
          href="https://app.blotato.com/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-coco-golden underline hover:text-coco-golden-dark"
        >
          Get your API key →
        </a>
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setStatus(null);
            }}
            placeholder="blt_..."
            className="pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-coco-brown-medium/50 hover:text-coco-brown-medium"
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>

        <Button
          onClick={handleTestConnection}
          disabled={!apiKey.trim() || testing}
          size="sm"
          className="bg-coco-golden text-white hover:bg-coco-golden-dark"
        >
          {testing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Testing…
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
      </div>

      {status?.type === "error" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {status.message}
        </div>
      )}

      {status?.type === "success" && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          Connected! Found {status.accounts} social account
          {status.accounts !== 1 ? "s" : ""}.
        </div>
      )}
    </div>
  );
}
