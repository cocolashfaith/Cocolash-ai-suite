import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

interface MessageInputProps {
  disabled: boolean;
  placeholder: string;
  onSend: (message: string) => void;
}

export function MessageInput({ disabled, placeholder, onSend }: MessageInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to max-height defined in CSS.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }, [value, disabled, onSend]);

  const onKeyDown = useCallback(
    (e: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  return (
    <div class="input">
      <textarea
        ref={ref}
        class="input__textarea"
        rows={1}
        placeholder={placeholder}
        value={value}
        onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label="Type your message"
      />
      <button
        type="button"
        class="input__send"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
