/**
 * FFmpeg WASM Caption Burner
 *
 * Burns styled SRT captions onto video using FFmpeg compiled to WebAssembly.
 * Produces a semi-transparent white pill background behind black text,
 * centered at the bottom of the frame — matching the industry-standard
 * look for educational/tutorial content.
 *
 * Architecture note: Uses @ffmpeg/ffmpeg (WASM) so it runs inside a
 * Node.js serverless function without requiring a native FFmpeg binary.
 * Suitable for low-volume processing (a few videos/day). For production
 * scale, migrate to AWS Lambda with a native FFmpeg layer.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";
import type { VideoCaptionStyle } from "@/lib/types";
import { DEFAULT_CAPTION_STYLE } from "@/lib/types";

const FFMPEG_CORE_VERSION = "0.12.6";
const CORE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

let _ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg?.loaded) return _ffmpeg;

  const ffmpeg = new FFmpeg();

  const coreURL = await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, "application/wasm");

  await ffmpeg.load({ coreURL, wasmURL });

  _ffmpeg = ffmpeg;
  return ffmpeg;
}

/**
 * Build an ASS (Advanced SubStation Alpha) subtitle file from SRT content.
 *
 * ASS gives us styled text with a background box (BorderStyle=4),
 * rounded appearance, and precise positioning — none of which
 * are possible with plain SRT in FFmpeg's subtitle filter.
 */
function srtToASS(
  srtContent: string,
  style: VideoCaptionStyle,
  videoWidth: number,
  videoHeight: number,
): string {
  const fontSize = Math.round((style.fontSize / 100) * videoHeight);
  const marginV = Math.round(((100 - style.position) / 100) * videoHeight);
  const marginH = Math.round(((100 - style.maxWidthPercent) / 200) * videoWidth);

  const bgR = parseInt(style.bgColor.slice(1, 3), 16);
  const bgG = parseInt(style.bgColor.slice(3, 5), 16);
  const bgB = parseInt(style.bgColor.slice(5, 7), 16);
  const bgAlpha = Math.round((1 - style.bgOpacity) * 255);
  const assOutlineColor = `&H${hex2(bgAlpha)}${hex2(bgB)}${hex2(bgG)}${hex2(bgR)}`;

  const fR = parseInt(style.fontColor.slice(1, 3), 16);
  const fG = parseInt(style.fontColor.slice(3, 5), 16);
  const fB = parseInt(style.fontColor.slice(5, 7), 16);
  const assPrimaryColor = `&H00${hex2(fB)}${hex2(fG)}${hex2(fR)}`;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${videoWidth}`,
    `PlayResY: ${videoHeight}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${style.fontFamily === "sans-serif" ? "Arial" : style.fontFamily},${fontSize},${assPrimaryColor},${assPrimaryColor},${assOutlineColor},${assOutlineColor},0,0,0,0,100,100,0,0,4,${style.borderRadius},0,2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = parseSRTToEvents(srtContent);

  const lines = events.map(
    (ev) =>
      `Dialogue: 0,${secondsToASSTime(ev.start)},${secondsToASSTime(ev.end)},Caption,,0,0,0,,${ev.text.replace(/\n/g, "\\N")}`
  );

  return header.join("\n") + "\n" + lines.join("\n") + "\n";
}

interface SubEvent {
  start: number;
  end: number;
  text: string;
}

function parseSRTToEvents(srt: string): SubEvent[] {
  const events: SubEvent[] = [];
  const blocks = srt.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const start =
      +timeMatch[1] * 3600 +
      +timeMatch[2] * 60 +
      +timeMatch[3] +
      +timeMatch[4] / 1000;
    const end =
      +timeMatch[5] * 3600 +
      +timeMatch[6] * 60 +
      +timeMatch[7] +
      +timeMatch[8] / 1000;
    const text = lines.slice(2).join("\n").trim();

    events.push({ start, end, text });
  }

  return events;
}

function secondsToASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);

  return (
    String(h) +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "." +
    String(cs).padStart(2, "0")
  );
}

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Burn styled captions into a video using FFmpeg WASM.
 *
 * @param videoUrl  - URL of the source video (fetched server-side)
 * @param srtContent - Standard SRT subtitle string
 * @param style     - Visual style config (defaults to white-pill educational look)
 * @returns Buffer of the processed MP4 video with captions burned in
 */
export async function burnCaptions(
  videoUrl: string,
  srtContent: string,
  style: VideoCaptionStyle = DEFAULT_CAPTION_STYLE,
): Promise<Buffer> {
  const ffmpeg = await getFFmpeg();

  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile("input.mp4", videoData);

  // Probe video dimensions by running a quick pass
  // Default to 1080x1920 (9:16 vertical) if probe fails
  let videoWidth = 1080;
  let videoHeight = 1920;

  try {
    let probeOutput = "";
    ffmpeg.on("log", ({ message }) => {
      probeOutput += message + "\n";
    });

    await ffmpeg.exec([
      "-i", "input.mp4",
      "-f", "null",
      "-frames:v", "1",
      "-y", "/dev/null",
    ]);

    const sizeMatch = probeOutput.match(/(\d{3,4})x(\d{3,4})/);
    if (sizeMatch) {
      videoWidth = parseInt(sizeMatch[1], 10);
      videoHeight = parseInt(sizeMatch[2], 10);
    }
  } catch {
    // Probe failed — use defaults
  }

  const assContent = srtToASS(srtContent, style, videoWidth, videoHeight);
  const assBytes = new TextEncoder().encode(assContent);
  await ffmpeg.writeFile("captions.ass", assBytes);

  await ffmpeg.exec([
    "-i", "input.mp4",
    "-vf", `ass=captions.ass`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-y", "output.mp4",
  ]);

  const outputData = await ffmpeg.readFile("output.mp4");

  // Cleanup virtual filesystem
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("captions.ass");
  await ffmpeg.deleteFile("output.mp4");

  if (outputData instanceof Uint8Array) {
    return Buffer.from(outputData);
  }

  throw new Error("FFmpeg produced unexpected output type");
}

/**
 * Check if FFmpeg WASM is available and can be loaded.
 * Useful for graceful degradation when WASM isn't supported.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  try {
    await getFFmpeg();
    return true;
  } catch {
    return false;
  }
}
