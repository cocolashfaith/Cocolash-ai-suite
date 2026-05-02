import { useEffect, useState } from "preact/hooks";
import { Fab } from "./components/Fab";
import { Header } from "./components/Header";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { ConsentStrip } from "./components/ConsentStrip";
import { TryOnDialog } from "./components/TryOnDialog";
import { Lightbox } from "./components/Lightbox";
import { Peek } from "./components/Peek";
import { useChat } from "./lib/useChat";

const QUICK_REPLY_CHIPS: ReadonlyArray<string> = [
  "What's most natural?",
  "Bold for a special event",
  "How do I apply them?",
];

const PEEK_DELAY_MS = 1500;
const PEEK_DISMISS_KEY = "cocolash:peek:dismissed";

export interface AppProps {
  apiBaseUrl: string;
  shopDomain?: string;
  customerId?: string;
}

interface ChatConfig {
  greeting: string;
  personaName: string;
  botEnabled: boolean;
}

const DEFAULT_CONFIG: ChatConfig = {
  greeting: "Hey gorgeous! I'm Coco — what can I help you find today?",
  personaName: "Coco",
  botEnabled: true,
};

export function App(props: AppProps) {
  const [open, setOpen] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CONFIG);
  const [tryOnTarget, setTryOnTarget] = useState<{ handle: string; title: string } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [peekVisible, setPeekVisible] = useState(false);

  const chat = useChat({
    apiBaseUrl: props.apiBaseUrl,
    shopDomain: props.shopDomain,
    customerId: props.customerId,
  });

  // Soft nudge: show a badge after 30s if the visitor hasn't opened the panel.
  useEffect(() => {
    const t = setTimeout(() => setShowBadge(true), 30000);
    return () => clearTimeout(t);
  }, []);

  // Proactive zero-state: pop the quick-reply Peek 1.5s after mount unless
  // the visitor has already dismissed it this session, has opened the panel,
  // or has already messaged Coco previously.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(PEEK_DISMISS_KEY) === "1";
    } catch {
      // sessionStorage may be disabled (private mode)
    }
    if (dismissed || open || chat.messages.length > 0) return;
    const t = setTimeout(() => setPeekVisible(true), PEEK_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, chat.messages.length]);

  const dismissPeek = () => {
    setPeekVisible(false);
    try {
      sessionStorage.setItem(PEEK_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  const onChipClick = (text: string) => {
    setPeekVisible(false);
    setOpen(true);
    setShowBadge(false);
    // Send the chip text as the visitor's first message. Consent gate
    // still applies — if the visitor hasn't accepted yet, the consent
    // strip blocks the send and the chip text is dropped (acceptable).
    if (chat.consent === "accepted") {
      void chat.send(text);
    } else {
      // Stage the message: open the panel so consent strip is visible,
      // and the visitor can re-tap once they accept. We don't auto-fill
      // the input to avoid surprising them.
      void chat.send(text);
    }
  };

  // Fetch live config (greeting + bot_enabled). Falls back to defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${props.apiBaseUrl.replace(/\/$/, "")}/api/chat/config`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<ChatConfig>;
        if (cancelled) return;
        setConfig({
          greeting: data.greeting ?? DEFAULT_CONFIG.greeting,
          personaName: data.personaName ?? DEFAULT_CONFIG.personaName,
          botEnabled: data.botEnabled ?? DEFAULT_CONFIG.botEnabled,
        });
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.apiBaseUrl]);

  if (!config.botEnabled) {
    return null; // bot kill-switch
  }

  const sending = chat.status === "sending" || chat.status === "streaming";
  const consentDeclined = chat.consent === "declined";

  if (!open) {
    return (
      <>
        {peekVisible ? (
          <Peek
            greeting={config.greeting}
            chips={QUICK_REPLY_CHIPS}
            onChip={onChipClick}
            onDismiss={dismissPeek}
          />
        ) : null}
        <Fab
          showBadge={showBadge && chat.messages.length === 0}
          onClick={() => {
            setOpen(true);
            setShowBadge(false);
            setPeekVisible(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div class="panel" role="dialog" aria-label="CocoLash chat">
        <Header personaName={config.personaName} onClose={() => setOpen(false)} />
        <MessageList
          messages={chat.messages}
          status={chat.status}
          errorMessage={chat.errorMessage}
          greeting={config.greeting}
          onTryOn={(handle, title) => setTryOnTarget({ handle, title })}
          onZoom={(url) => setZoomedImage(url)}
        />
        {tryOnTarget && chat.sessionId ? (
          <TryOnDialog
            cfg={{ apiBaseUrl: props.apiBaseUrl, sessionId: chat.sessionId }}
            productHandle={tryOnTarget.handle}
            productTitle={tryOnTarget.title}
            onClose={() => setTryOnTarget(null)}
            onResult={(composedUrl) => chat.appendTryOnResult(composedUrl, tryOnTarget.title)}
          />
        ) : null}
        {chat.consent === null ? (
          <ConsentStrip onAccept={chat.acceptConsent} onDecline={chat.declineConsent} />
        ) : null}
        <MessageInput
          disabled={sending || consentDeclined || chat.consent === null}
          placeholder={
            consentDeclined
              ? "Reload to chat with Coco again"
              : chat.consent === null
                ? "Accept above to start chatting…"
                : "Ask Coco anything…"
          }
          onSend={chat.send}
        />
      </div>
      <Fab
        showBadge={false}
        onClick={() => setOpen(false)}
      />
      {zoomedImage ? (
        <Lightbox
          src={zoomedImage}
          alt="Try-on preview"
          onClose={() => setZoomedImage(null)}
        />
      ) : null}
    </>
  );
}
