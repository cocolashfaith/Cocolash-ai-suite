/**
 * Entry point for the CocoLash chat widget bundle.
 *
 * Mounts an isolated Shadow DOM so the widget's CSS does not leak into the
 * Shopify theme and vice versa. Reads `window.COCOLASH_CHAT_CONFIG` for
 * the API base URL and (optional) shop / customer context.
 */

import { render } from "preact";
import { App } from "./App";
import widgetCss from "./styles/widget.css?inline";

interface BootConfig {
  apiBaseUrl: string;
  shopDomain?: string;
  customerId?: string;
}

declare global {
  interface Window {
    COCOLASH_CHAT_CONFIG?: BootConfig;
  }
}

function bootstrap(): void {
  const cfg = window.COCOLASH_CHAT_CONFIG;
  if (!cfg || typeof cfg.apiBaseUrl !== "string") {
    // Silent: nothing to render. Most likely the boot snippet didn't set
    // COCOLASH_CHAT_CONFIG before loading widget.js.
    return;
  }

  // Idempotent mount: if a previous bundle already mounted, do nothing.
  if (document.getElementById("cocolash-chat-host") !== null) return;

  const host = document.createElement("div");
  host.id = "cocolash-chat-host";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.inset = "auto";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = widgetCss;
  shadow.appendChild(styleEl);

  const mount = document.createElement("div");
  shadow.appendChild(mount);

  render(<App apiBaseUrl={cfg.apiBaseUrl} shopDomain={cfg.shopDomain} customerId={cfg.customerId} />, mount);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
