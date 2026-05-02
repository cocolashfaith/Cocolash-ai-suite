interface FabProps {
  onClick: () => void;
  showBadge: boolean;
}

export function Fab({ onClick, showBadge }: FabProps) {
  return (
    <button
      type="button"
      class="fab"
      onClick={onClick}
      aria-label="Chat with Coco"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {showBadge ? <span class="fab__badge" /> : null}
    </button>
  );
}
