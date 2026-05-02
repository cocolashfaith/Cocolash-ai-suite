/**
 * useChat — high-level hook orchestrating SSE + persistence + UI state.
 *
 * Exposes a `send(message)` action that:
 *   1. Appends the user message locally
 *   2. Appends an empty assistant message
 *   3. Fires POST /api/chat
 *   4. Streams 'token' events into the assistant bubble
 *   5. Captures 'sources' / 'done' / 'error' events
 *   6. Persists session id + final transcript to localStorage
 */

import { useCallback, useState } from "preact/hooks";
import { postSse } from "./sse";
import { usePersistedState, uuid, type Message, type ProductCard } from "./state";

export type ChatStatus = "idle" | "sending" | "streaming" | "error";

export interface UseChatResult {
  messages: Message[];
  consent: "accepted" | "declined" | null;
  status: ChatStatus;
  errorMessage: string | null;
  send: (message: string) => Promise<void>;
  acceptConsent: () => void;
  declineConsent: () => void;
  reset: () => void;
}

export interface UseChatOptions {
  apiBaseUrl: string;
  shopDomain?: string;
  customerId?: string;
}

export function useChat(opts: UseChatOptions): UseChatResult {
  const { state, setSessionId, appendMessage, updateLastAssistant, attachProductsToLast, setConsent, reset } =
    usePersistedState();

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const send = useCallback(
    async (message: string): Promise<void> => {
      const trimmed = message.trim();
      if (trimmed.length === 0) return;
      if (status === "sending" || status === "streaming") return;

      setStatus("sending");
      setErrorMessage(null);

      const now = Date.now();
      appendMessage({
        id: uuid(),
        role: "user",
        content: trimmed,
        createdAt: now,
      });
      appendMessage({
        id: uuid(),
        role: "assistant",
        content: "",
        createdAt: now + 1,
      });

      try {
        const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/chat`;
        const body = {
          sessionId: state.sessionId ?? undefined,
          message: trimmed,
          customerId: opts.customerId,
          shopDomain: opts.shopDomain,
        };
        let sourceIds: string[] = [];
        setStatus("streaming");

        for await (const frame of postSse({ url, body })) {
          if (frame.event === "token") {
            try {
              const { delta } = JSON.parse(frame.data) as { delta: string };
              if (delta && delta.length > 0) {
                updateLastAssistant(delta);
              }
            } catch {
              // ignore malformed token frame
            }
          } else if (frame.event === "sources") {
            try {
              const parsed = JSON.parse(frame.data) as { chunkIds: string[] };
              sourceIds = parsed.chunkIds ?? [];
            } catch {
              // ignore
            }
          } else if (frame.event === "products") {
            try {
              const parsed = JSON.parse(frame.data) as { products: ProductCard[] };
              if (parsed.products?.length > 0) attachProductsToLast(parsed.products);
            } catch {
              // ignore
            }
          } else if (frame.event === "done") {
            try {
              const parsed = JSON.parse(frame.data) as { sessionId: string };
              if (parsed.sessionId) setSessionId(parsed.sessionId);
              updateLastAssistant("", sourceIds);
            } catch {
              // ignore
            }
          } else if (frame.event === "error") {
            try {
              const parsed = JSON.parse(frame.data) as { message: string };
              setErrorMessage(parsed.message ?? "Something went wrong.");
            } catch {
              setErrorMessage("Something went wrong.");
            }
            setStatus("error");
            return;
          }
        }
        setStatus("idle");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Network error — please try again."
        );
        setStatus("error");
      }
    },
    [opts.apiBaseUrl, opts.shopDomain, opts.customerId, state.sessionId, status, appendMessage, setSessionId, updateLastAssistant, attachProductsToLast]
  );

  const acceptConsent = useCallback(() => setConsent("accepted"), [setConsent]);
  const declineConsent = useCallback(() => setConsent("declined"), [setConsent]);

  return {
    messages: state.messages,
    consent: state.consent,
    status,
    errorMessage,
    send,
    acceptConsent,
    declineConsent,
    reset,
  };
}
