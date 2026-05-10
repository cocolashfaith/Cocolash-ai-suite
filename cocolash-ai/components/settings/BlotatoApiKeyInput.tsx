"use client";

import { useState, useEffect } from "react";
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

interface StatusData {
  hasEnvKey: boolean;
  hasDbKey: boolean;
  lastTestedAt: string | null;
  accountsFound: number | null;
}

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
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<
    { type: "success"; accounts: number } | { type: "error"; message: string } | null
  >(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/settings/blotato/status");
        if (res.ok) {
          const data = (await res.json()) as StatusData;
          setStatusData(data);
        }
      } catch (error: unknown) {
        console.error("Failed to fetch Blotato status:", error);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchStatus();
  }, []);

  const handleTestConnection = async () => {
    const useEnvKey = !apiKey.trim() && statusData?.hasEnvKey;

    if (!useEnvKey && !apiKey.trim()) return;

    setTesting(true);
    setStatus(null);

    try {
      if (useEnvKey) {
        // Test against env var key
        const res = await fetch("/api/settings/blotato/test", {
          method: "GET",
        });

        const data = (await res.json()) as {
          success: boolean;
          connected: boolean;
          accounts_found?: number;
          error?: string;
        };

        if (!res.ok || !data.connected) {
          setStatus({ type: "error", message: data.error || "Connection failed" });
          return;
        }

        setStatus({ type: "success", accounts: data.accounts_found ?? 0 });
        onConnected?.(data.accounts_found ?? 0);
      } else {
        // Phase 27 Wave-6 (27-09, finding #3): test a freshly pasted key via
        // POST /api/settings/blotato/test WITHOUT saving it to the DB. Save
        // only happens when the user explicitly clicks Save below.
        const res = await fetch("/api/settings/blotato/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        });

        const data = (await res.json()) as {
          success?: boolean;
          connected?: boolean;
          accounts_found?: number;
          error?: string;
        };

        if (!res.ok || !data.connected) {
          setStatus({ type: "error", message: data.error || "Connection failed" });
          return;
        }

        setStatus({ type: "success", accounts: data.accounts_found ?? 0 });
        onConnected?.(data.accounts_found ?? 0);
      }
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  };

  const isTestButtonEnabled =
    (apiKey.trim() || (statusData?.hasEnvKey && !loadingStatus)) && !testing;

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

      {!loadingStatus && statusData?.hasEnvKey && !apiKey.trim() && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="text-xs text-emerald-700">
            <p className="font-medium">
              A Blotato API key is configured via your Vercel environment.
            </p>
            <p>
              You can paste a new key below to override, or click Test
              Connection to verify the configured key works.
            </p>
          </div>
        </div>
      )}

      {!loadingStatus &&
        statusData?.hasDbKey &&
        !statusData?.hasEnvKey &&
        !apiKey.trim() && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <div className="text-xs text-emerald-700">
              <p className="font-medium">
                Last connected:{" "}
                {statusData.lastTestedAt
                  ? new Date(statusData.lastTestedAt).toLocaleDateString()
                  : "Unknown"}{" "}
                with{" "}
                {statusData.accountsFound ?? 0} social account
                {statusData.accountsFound !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>
        )}

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
          disabled={!isTestButtonEnabled}
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
