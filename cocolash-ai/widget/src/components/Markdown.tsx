import { useMemo } from "preact/hooks";
import { renderMarkdown } from "../lib/markdown";

export interface MarkdownProps {
  text: string;
  className?: string;
}

export function Markdown({ text, className }: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  // The renderMarkdown helper escapes HTML before applying its own tags,
  // so the output is safe to inject. Restricted to inside the Shadow DOM.
  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
