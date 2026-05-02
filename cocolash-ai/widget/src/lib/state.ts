/**
 * Local conversation state for the widget. Persisted to localStorage so
 * a refresh doesn't blow the session away (D-16).
 */

import { useEffect, useState } from "preact/hooks";

const STORAGE_KEY = "cocolash:chat:v1";
const TTL_DAYS = 30;

export interface ProductCard {
  handle: string;
  title: string;
  description: string;
  image: { url: string; alt: string } | null;
  priceFrom: string;
  priceTo: string;
  currency: string;
  available: boolean;
  productUrl: string;
  addToCartUrl: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** Source chunk IDs returned by the server for this assistant turn. */
  sourceIds?: string[];
  /** Live Shopify product cards attached to this assistant turn (Phase 4). */
  products?: ProductCard[];
  /** Composed try-on image URL attached to this assistant turn (Phase 6). */
  tryonImageUrl?: string;
}

export interface PersistedState {
  sessionId: string | null;
  messages: Message[];
  consent: "accepted" | "declined" | null;
  updatedAt: number;
}

const defaultState: PersistedState = {
  sessionId: null,
  messages: [],
  consent: null,
  updatedAt: Date.now(),
};

function readStorage(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as PersistedState;
    const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.updatedAt > ttlMs) return defaultState;
    return {
      sessionId: parsed.sessionId ?? null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      consent: parsed.consent ?? null,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return defaultState;
  }
}

function writeStorage(state: PersistedState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: Date.now() })
    );
  } catch {
    // localStorage may be disabled (private mode); fail silently.
  }
}

export function usePersistedState(): {
  state: PersistedState;
  setSessionId: (id: string) => void;
  appendMessage: (m: Message) => void;
  updateLastAssistant: (delta: string, sourceIds?: string[]) => void;
  attachProductsToLast: (products: ProductCard[]) => void;
  appendTryOnResult: (composedUrl: string, productTitle: string) => void;
  setConsent: (c: "accepted" | "declined") => void;
  reset: () => void;
} {
  const [state, setState] = useState<PersistedState>(() => readStorage());

  useEffect(() => {
    writeStorage(state);
  }, [state]);

  return {
    state,
    setSessionId: (id) => setState((s) => ({ ...s, sessionId: id })),
    appendMessage: (m) =>
      setState((s) => ({ ...s, messages: [...s.messages, m].slice(-50) })),
    updateLastAssistant: (delta, sourceIds) =>
      setState((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") {
          messages[messages.length - 1] = {
            ...last,
            content: last.content + delta,
            sourceIds: sourceIds ?? last.sourceIds,
          };
        }
        return { ...s, messages };
      }),
    attachProductsToLast: (products) =>
      setState((s) => {
        const messages = s.messages.slice();
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") {
          messages[messages.length - 1] = { ...last, products };
        }
        return { ...s, messages };
      }),
    appendTryOnResult: (composedUrl, productTitle) =>
      setState((s) => {
        const messages = [
          ...s.messages,
          {
            id: uuid(),
            role: "assistant" as const,
            content: `Here's how ${productTitle} looks on you 💛`,
            createdAt: Date.now(),
            tryonImageUrl: composedUrl,
          },
        ].slice(-50);
        return { ...s, messages };
      }),
    setConsent: (c) => setState((s) => ({ ...s, consent: c })),
    reset: () => setState({ ...defaultState, updatedAt: Date.now() }),
  };
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers (rare; widget targets modern only).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
