import { useEffect, useRef } from "preact/hooks";
import { Markdown } from "./Markdown";
import type { Message } from "../lib/state";
import type { ChatStatus } from "../lib/useChat";

interface MessageListProps {
  messages: Message[];
  status: ChatStatus;
  errorMessage: string | null;
  greeting: string;
}

export function MessageList({ messages, status, errorMessage, greeting }: MessageListProps) {
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
          <Markdown
            key={m.id}
            text={m.content || (status === "streaming" ? "" : " ")}
            className="bubble bubble--assistant"
          />
        )
      )}
      {status === "streaming" && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1].content.length === 0 ? (
        <div class="typing"><span /><span /><span /></div>
      ) : null}
      {errorMessage ? <div class="error">{errorMessage}</div> : null}
    </div>
  );
}
