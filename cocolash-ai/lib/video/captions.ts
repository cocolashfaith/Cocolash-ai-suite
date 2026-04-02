/**
 * SRT Caption Generator
 *
 * Creates SubRip (.srt) subtitle files from script text.
 * Distributes words evenly across the video duration using a
 * word-per-second model (~2.5 spoken words/second).
 *
 * When HeyGen provides built-in captions via video_url_caption,
 * this module is not needed — it serves as a fallback for
 * Cloudinary-based subtitle overlay.
 */

const WORDS_PER_LINE = 6;
const WORDS_PER_SECOND = 2.5;
const MIN_CUE_DURATION = 1.0;
const MAX_CUE_DURATION = 4.0;

interface SRTCue {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Generate an SRT subtitle string from script text.
 *
 * Splits the script into word groups, distributes them across
 * the video duration, and formats as standard SRT.
 */
export function generateSRTFromScript(
  scriptText: string,
  durationSeconds: number
): string {
  const words = scriptText
    .replace(/\*([^*]+)\*/g, "$1") // strip emphasis markers
    .replace(/\.\.\./g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return "";

  const cues = buildCues(words, durationSeconds);
  return formatSRT(cues);
}

/**
 * Build timed cues from a word array and total duration.
 */
function buildCues(words: string[], totalDuration: number): SRTCue[] {
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    groups.push(words.slice(i, i + WORDS_PER_LINE));
  }

  const totalWords = words.length;
  const cues: SRTCue[] = [];
  let currentTime = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupWordCount = group.length;

    const naturalDuration = groupWordCount / WORDS_PER_SECOND;
    const proportionalDuration = (groupWordCount / totalWords) * totalDuration;

    let cueDuration = Math.max(
      MIN_CUE_DURATION,
      Math.min(MAX_CUE_DURATION, Math.min(naturalDuration, proportionalDuration))
    );

    if (i === groups.length - 1) {
      cueDuration = Math.min(MAX_CUE_DURATION, totalDuration - currentTime);
    }

    if (currentTime + cueDuration > totalDuration) {
      cueDuration = totalDuration - currentTime;
    }

    if (cueDuration <= 0) break;

    cues.push({
      index: i + 1,
      startTime: currentTime,
      endTime: currentTime + cueDuration,
      text: group.join(" "),
    });

    currentTime += cueDuration;
  }

  return cues;
}

/**
 * Format cues into SRT subtitle format.
 */
function formatSRT(cues: SRTCue[]): string {
  return cues
    .map((cue) => {
      const start = formatTimestamp(cue.startTime);
      const end = formatTimestamp(cue.endTime);
      return `${cue.index}\n${start} --> ${end}\n${cue.text}`;
    })
    .join("\n\n");
}

/**
 * Format seconds as SRT timestamp: HH:MM:SS,mmm
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}
