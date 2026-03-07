"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlotatoApiKeyInput } from "./BlotatoApiKeyInput";
import { ConnectedAccountCard } from "./ConnectedAccountCard";
import type { SocialAccount } from "@/lib/types";
import {
  Share2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  AlertCircle,
  Users,
} from "lucide-react";

export function SocialAccountsManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/social-accounts");
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400) {
          setAccounts([]);
          return;
        }
        throw new Error(data.error || "Failed to fetch accounts");
      }

      setAccounts(data.accounts ?? []);
      if (data.accounts?.length > 0) {
        setLastSynced(data.accounts[0].last_synced_at);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchAccounts();
  }, [isOpen, fetchAccounts]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch("/api/social-accounts/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }

      setAccounts(data.accounts ?? []);
      setLastSynced(data.synced_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleConnected = () => {
    fetchAccounts();
  };

  const formatLastSynced = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-coco-pink-dark/20 bg-white shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-coco-beige/30"
      >
        <Share2 className="h-5 w-5 text-coco-golden" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-coco-brown">
            Social Publishing
          </h3>
          <p className="text-xs text-coco-brown-medium">
            Connect Blotato to publish directly to social platforms
          </p>
        </div>
        {accounts.length > 0 && (
          <span className="mr-2 flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Users className="h-3 w-3" />
            {accounts.length}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-coco-brown-medium/50" />
        ) : (
          <ChevronDown className="h-5 w-5 text-coco-brown-medium/50" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-coco-pink-dark/20 px-5 pb-5 pt-4">
          <BlotatoApiKeyInput onConnected={handleConnected} />

          <div className="h-px bg-coco-pink-dark/10" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-coco-brown">
                Connected Accounts
              </h4>
              <div className="flex items-center gap-2">
                {lastSynced && (
                  <span className="text-[10px] text-coco-brown-medium/60">
                    Synced {formatLastSynced(lastSynced)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className="h-7 text-xs"
                >
                  {syncing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  Sync
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : accounts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((account) => (
                  <ConnectedAccountCard
                    key={account.id}
                    account={account}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-coco-pink-dark/20 bg-coco-beige/20 px-4 py-8 text-center">
                <Users className="mx-auto h-8 w-8 text-coco-brown-medium/30" />
                <p className="mt-2 text-sm font-medium text-coco-brown">
                  No accounts connected
                </p>
                <p className="mt-1 text-xs text-coco-brown-medium">
                  Connect your social accounts in{" "}
                  <a
                    href="https://app.blotato.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-coco-golden underline hover:text-coco-golden-dark"
                  >
                    Blotato&apos;s dashboard
                  </a>
                  , then enter your API key above.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
