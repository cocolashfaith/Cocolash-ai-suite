interface HeaderProps {
  personaName: string;
  onClose: () => void;
}

export function Header({ personaName, onClose }: HeaderProps) {
  const initial = personaName.slice(0, 1).toUpperCase();
  return (
    <div class="header">
      <div class="header__avatar" aria-hidden="true">{initial}</div>
      <div class="header__title">
        {personaName}
        <span class="header__subtitle">Your CocoLash assistant</span>
      </div>
      <button
        type="button"
        class="header__close"
        onClick={onClose}
        aria-label="Close chat"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
