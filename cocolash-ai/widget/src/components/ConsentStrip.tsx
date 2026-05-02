interface ConsentStripProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function ConsentStrip({ onAccept, onDecline }: ConsentStripProps) {
  return (
    <div class="consent">
      <p>
        Hey gorgeous! By chatting with Coco you agree to a few cookies that help me remember our convo and our{" "}
        <a href="https://cocolash.com/policies/terms-of-service" target="_blank" rel="noopener noreferrer">
          terms
        </a>
        .
      </p>
      <div class="consent__buttons">
        <button type="button" class="consent__btn consent__btn--accept" onClick={onAccept}>
          OK
        </button>
        <button type="button" class="consent__btn consent__btn--decline" onClick={onDecline}>
          No thanks
        </button>
      </div>
    </div>
  );
}
