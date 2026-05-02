/**
 * Tiny SSE client for the CocoLash chat widget.
 *
 * Browsers ship `EventSource`, but it only supports GET requests. The chat
 * endpoint is POST (with a JSON body), so we use fetch + ReadableStream and
 * parse the SSE protocol ourselves. This is ~30 lines and avoids pulling
 * a library.
 *
 * SSE format (one frame):
 *   event: <name>\n
 *   data: <utf-8-payload>\n
 *   \n
 *
 * Multi-line `data:` is supported via accumulation. Comment lines (`:` prefix)
 * are ignored.
 */

export interface SseFrame {
  event: string;
  data: string;
}

export interface PostSseOptions {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function* postSse(opts: PostSseOptions): AsyncGenerator<SseFrame> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      message += `: ${text}`;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Each frame is separated by a blank line. Read into the buffer, split, parse.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseFrame(rawFrame);
      if (parsed) yield parsed;
    }
  }

  // Flush any trailing frame (rare but possible if the stream ends without \n\n).
  if (buffer.trim().length > 0) {
    const parsed = parseFrame(buffer);
    if (parsed) yield parsed;
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    if (line.startsWith(":")) continue; // comment
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
