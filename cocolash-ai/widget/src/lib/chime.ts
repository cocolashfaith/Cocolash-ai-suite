/**
 * widget/src/lib/chime.ts — a soft notification chime for the proactive Peek.
 *
 * Synthesized with the Web Audio API so there's no audio asset to host (works
 * even with Cloudinary/CDN down). Browsers block audio until the user has
 * interacted with the page (autoplay policy), so if the AudioContext can't be
 * resumed yet we arm a one-time listener and play the pending chime on the
 * first user gesture. A persisted mute preference gates everything.
 */

const MUTE_KEY = "cocolash:sound:muted";

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode) — non-fatal
  }
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let pendingChime = false;
let gestureArmed = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Play a soft two-note rising "ding" (A5 → D6) with a quick decay. */
function tone(context: AudioContext): void {
  const now = context.currentTime;
  const notes = [
    { freq: 880, at: 0 }, // A5
    { freq: 1174.66, at: 0.12 }, // D6
  ];
  for (const note of notes) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    const start = now + note.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  }
}

function armGesture(): void {
  if (gestureArmed) return;
  gestureArmed = true;
  const handler = () => {
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("scroll", handler);
    gestureArmed = false;
    if (pendingChime) {
      pendingChime = false;
      playChime();
    }
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
  window.addEventListener("scroll", handler, { once: true, passive: true });
}

/**
 * Play the chime, respecting the mute preference and browser autoplay policy.
 * If audio is still locked (no user gesture yet), defer to the first gesture.
 */
export function playChime(): void {
  if (isSoundMuted()) return;
  const context = getCtx();
  if (!context) return;

  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => {
        if (context.state === "running") {
          tone(context);
        } else {
          pendingChime = true;
          armGesture();
        }
      })
      .catch(() => {
        pendingChime = true;
        armGesture();
      });
    return;
  }

  tone(context);
}
