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
}

export function MessageList({ messages, status, errorMessage, greeting, onTryOn }: MessageListProps) {
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
              <div class="tryon-result">
                <img src={m.tryonImageUrl} alt="Try-on preview" loading="lazy" />
              </div>
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
