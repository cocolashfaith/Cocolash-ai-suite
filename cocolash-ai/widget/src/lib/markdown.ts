/**
 * Tiny safe-Markdown renderer for chat assistant messages.
 *
 * Supports a strict subset:
 *   **bold**   *italic*   `code`   [text](url)   - bullet  1. ordered
 *   double-newline → paragraph break
 *
 * All input is HTML-escaped first. Links must be http(s); relative URLs
 * are rejected. Returned string is safe to set as innerHTML in a Shadow DOM.
 */

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw, "https://placeholder.invalid");
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname === "placeholder.invalid") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function renderMarkdown(input: string): string {
  if (!input) return "";
  let html = escapeHtml(input);

  // Inline code (preserve as-is)
  html = html.replace(/`([^`]+?)`/g, (_m, code) => `<code>${code}</code>`);

  // Bold (must come before italic since ** > *)
  html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");

  // Italic (single *)
  html = html.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m, text, url) => {
    const safe = safeUrl(url);
    if (!safe) return text;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Lists: simple line-by-line conversion
  const lines = html.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  for (const raw of lines) {
    const ulMatch = /^- (.*)$/.exec(raw);
    const olMatch = /^\d+\. (.*)$/.exec(raw);
    if (ulMatch) {
      if (!inUl) {
        if (inOl) {
          out.push("</ol>");
          inOl = false;
        }
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }
    if (olMatch) {
      if (!inOl) {
        if (inUl) {
          out.push("</ul>");
          inUl = false;
        }
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${olMatch[1]}</li>`);
      continue;
    }
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
    out.push(raw);
  }
  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");

  // Paragraphs (split on double-newline)
  const blocks = out.join("\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      if (block.trim().length === 0) return "";
      // Don't wrap blocks that are already pure block elements
      if (/^<(ul|ol|li|p|h\d|pre|blockquote)/i.test(block.trim())) {
        return block;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .filter((b) => b.length > 0)
    .join("\n");
}
