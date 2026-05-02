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
}

export function Peek({ greeting, chips, onChip, onDismiss }: PeekProps) {
  return (
    <div class="peek" role="dialog" aria-label="Quick reply suggestions">
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
