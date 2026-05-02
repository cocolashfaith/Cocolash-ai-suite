import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Markdown } from "./Markdown";
import { ProductCards } from "./ProductCards";
import type { Message } from "../lib/state";
import type { ChatStatus } from "../lib/useChat";

interface MessageListProps {
  messages: Message[];
  status: ChatStatus;
  errorMessage: string | null;
  greeting: string;
  onTryOn?: (handle: string, title: string) => void;
  onZoom?: (url: string) => void;
}

export function MessageList({ messages, status, errorMessage, greeting, onTryOn, onZoom }: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Synthesize the greeting as the first assistant turn when no real messages exist yet.
  const showGreeting = messages.length === 0;

  return (
    <div class="messages" ref={ref}>
      {showGreeting ? (
        <div class="bubble bubble--assistant">{greeting}</div>
      ) : null}
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} class="bubble bubble--user">{m.content}</div>
        ) : (
          <Fragment key={m.id}>
            <Markdown
              text={m.content || (status === "streaming" ? "" : " ")}
              className="bubble bubble--assistant"
            />
            {m.products && m.products.length > 0 ? (
              <ProductCards products={m.products} onTryOn={onTryOn} />
            ) : null}
            {m.tryonImageUrl ? (
              <button
                type="button"
                class="tryon-result tryon-result--button"
                onClick={() => onZoom?.(m.tryonImageUrl!)}
                aria-label="Tap to view full size"
              >
                <img
                  src={m.tryonImageUrl}
                  alt="Try-on preview"
                  referrerpolicy="no-referrer"
                  decoding="async"
                  onLoad={(e) => {
                    console.log("[Coco] try-on image loaded:", m.tryonImageUrl);
                    // Re-scroll the chat to the bottom now that the image has
                    // measurable height; the message-array effect fires before
                    // the lazy load and would otherwise leave the image below
                    // the visible scroll area.
                    const list = (e.currentTarget as HTMLElement).closest(".messages") as HTMLElement | null;
                    if (list) list.scrollTop = list.scrollHeight;
                  }}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    console.error("[Coco] try-on image failed to load:", img.src);
                    img.style.display = "none";
                    const fallback = document.createElement("a");
                    fallback.href = img.src;
                    fallback.textContent = "Open try-on preview";
                    fallback.target = "_blank";
                    fallback.rel = "noopener noreferrer";
                    fallback.style.cssText = "display:block;padding:12px;background:#f4f4f4;border-radius:8px;text-decoration:underline;";
                    img.parentElement?.appendChild(fallback);
                  }}
                />
              </button>
            ) : null}
          </Fragment>
        )
      )}
      {status === "streaming" && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1].content.length === 0 ? (
        <div class="typing"><span /><span /><span /></div>
      ) : null}
      {errorMessage ? <div class="error">{errorMessage}</div> : null}
    </div>
  );
}
