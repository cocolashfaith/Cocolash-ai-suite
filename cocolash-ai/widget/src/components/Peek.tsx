/**
 * Peek — proactive zero-state engagement.
 *
 * Floats above the FAB after ~1.5s on first visit, showing the persona
 * greeting and three tappable quick-reply chips. Click a chip to open the
 * panel and immediately send the chip's text as the visitor's first
 * message. Dismissing the peek hides it for the rest of the session.
 */

interface PeekProps {
  greeting: string;
  chips: ReadonlyArray<string>;
  onChip: (text: string) => void;
  onDismiss: () => void;
  /** Current sound preference + toggle (the Peek plays a soft chime on arrival). */
  muted?: boolean;
  onToggleMute?: () => void;
}

export function Peek({ greeting, chips, onChip, onDismiss, muted, onToggleMute }: PeekProps) {
  return (
    <div class="peek" role="dialog" aria-label="Quick reply suggestions">
      <div class="peek__controls">
        {onToggleMute ? (
          <button
            type="button"
            class="peek__mute"
            aria-label={muted ? "Unmute chat sound" : "Mute chat sound"}
            aria-pressed={muted ? "true" : "false"}
            title={muted ? "Sound off" : "Sound on"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
          >
            {muted ? "🔇" : "🔔"}
          </button>
        ) : null}
        <button
          type="button"
          class="peek__close"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          ×
        </button>
      </div>
      <p class="peek__greeting">{greeting}</p>
      <div class="peek__chips">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            class="peek__chip"
            onClick={() => onChip(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
