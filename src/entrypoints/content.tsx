import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Overlay } from '../ui/Overlay';

const HOST_ID = 'vibela-extension-host';
const TOGGLE_MESSAGE = 'VIBE_COPILOT_TOGGLE';
const GET_STATE_MESSAGE = 'VIBE_COPILOT_GET_STATE';
const RESTRICTED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'moz-extension:',
  'devtools:',
  'view-source:',
]);

function isAllowedPage(): boolean {
  return !RESTRICTED_SCHEMES.has(window.location.protocol);
}

function OverlayRoot({ shadowHostEl }: { shadowHostEl: HTMLElement }) {
  const [active, setActive] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [tabId, setTabId] = useState<number | undefined>();
  // The message listener below is registered once (empty deps), so it would
  // capture a stale `tabId` from the first render. Read the current value from
  // a ref instead, kept in sync on every commit.
  const tabIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const commitTabId = (id?: number) => {
      if (id == null) return;
      tabIdRef.current = id;
      setTabId(id);
    };

    chrome.runtime.sendMessage({ type: GET_STATE_MESSAGE }, (response?: { active?: boolean; allowed?: boolean; tabId?: number }) => {
      if (chrome.runtime.lastError || !response) return;
      setAllowed(Boolean(response.allowed));
      setActive(Boolean(response.active));
      commitTabId(response.tabId);
    });

    const listener = (
      message: { type?: string; active?: boolean; tabId?: number },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: { ok: true } | { ok: false; reason: string }) => void,
    ) => {
      if (message?.type !== TOGGLE_MESSAGE) return false;
      if (!isAllowedPage()) {
        sendResponse({ ok: false, reason: 'restricted-page' });
        return false;
      }
      if (!message.tabId && tabIdRef.current == null) {
        sendResponse({ ok: false, reason: 'tab-id-not-ready' });
        return false;
      }
      commitTabId(message.tabId);
      setActive(Boolean(message.active));
      sendResponse({ ok: true });
      return false;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return <Overlay active={active} allowed={allowed} shadowHostEl={shadowHostEl} tabId={tabId} />;
}

function mountOverlay() {
  if (!document.documentElement || document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }

    /* ── BOLITA ─────────────────────────────────────────── */
    .vc-bolita {
      position: fixed;
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      border: none;
      border-radius: 999px;
      background: radial-gradient(circle at 35% 28%, #1e3a5f, #020617 80%);
      box-shadow:
        0 0 0 1.5px rgba(96, 165, 250, 0.55),
        0 0 14px 2px rgba(59, 130, 246, 0.25),
        0 12px 32px rgba(2, 6, 23, 0.55);
      pointer-events: auto;
      cursor: grab;
      z-index: 2147483500;
      transition: opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;
      user-select: none;
      padding: 0;
      overflow: hidden;
    }
    .vc-bolita img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      user-select: none;
      border-radius: 50%;
      display: block;
    }
    .vc-bolita:hover {
      opacity: 1 !important;
      transform: scale(1.08);
      box-shadow:
        0 0 0 2px rgba(96, 165, 250, 0.9),
        0 0 22px 6px rgba(59, 130, 246, 0.45),
        0 14px 36px rgba(2, 6, 23, 0.6);
    }
    .vc-bolita.is-open {
      opacity: 1 !important;
      transform: scale(1.06);
      box-shadow:
        0 0 0 2px #60a5fa,
        0 0 20px 4px rgba(59, 130, 246, 0.5),
        0 12px 30px rgba(2, 6, 23, 0.5);
    }
    .vc-bolita.is-dim { opacity: 0.3; }
    .vc-bolita.is-dragging { cursor: grabbing; transition: none; }
    .vc-bolita::after {
      content: '';
      position: absolute;
      right: -2px;
      top: -2px;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 2.5px solid #020617;
      background: #334155;
      transition: background 200ms ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .vc-bolita[data-mode="annotate"]::after { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
    .vc-bolita[data-mode="transform"]::after { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
    .vc-bolita[data-mode="swap"]::after { background: #a78bfa; box-shadow: 0 0 6px #a78bfa; }
    .vc-bolita[data-mode="text-edit"]::after { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }

    /* ── PANEL ──────────────────────────────────────────── */
    .vc-panel {
      position: fixed;
      width: min(290px, calc(100vw - 32px));
      display: grid;
      gap: 0;
      padding: 0;
      border: 1px solid rgba(96, 165, 250, 0.2);
      border-radius: 18px;
      background: rgba(8, 15, 32, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: #f8fafc;
      box-shadow:
        0 0 0 1px rgba(96, 165, 250, 0.08),
        0 20px 60px rgba(2, 6, 23, 0.7),
        0 0 40px rgba(59, 130, 246, 0.08);
      font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: auto;
      z-index: 2147483400;
      overflow: hidden;
    }
    .vc-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid rgba(96, 165, 250, 0.1);
    }
    .vc-panel-header img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      border-radius: 50%;
    }
    .vc-panel-header strong {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: 0.01em;
    }
    .vc-panel-header .vc-badge {
      margin-left: auto;
      font-size: 10px;
      font-weight: 600;
      color: #60a5fa;
      background: rgba(96, 165, 250, 0.12);
      border: 1px solid rgba(96, 165, 250, 0.25);
      border-radius: 999px;
      padding: 1px 7px;
      letter-spacing: 0.04em;
    }
    .vc-panel-body { padding: 10px 12px; display: grid; gap: 10px; }
    .vc-panel-section-label {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .vc-modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .vc-modes button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border: 1px solid rgba(71, 85, 105, 0.6);
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.7);
      color: #94a3b8;
      cursor: pointer;
      font: 12px/1 ui-sans-serif, system-ui, sans-serif;
      font-weight: 500;
      transition: all 120ms ease;
      text-align: left;
    }
    .vc-modes button:hover {
      border-color: rgba(96, 165, 250, 0.4);
      color: #e2e8f0;
      background: rgba(30, 41, 59, 0.8);
    }
    .vc-modes button.is-on {
      border-color: rgba(96, 165, 250, 0.7);
      background: rgba(29, 78, 216, 0.25);
      color: #93c5fd;
      font-weight: 600;
    }
    .vc-mode-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    .vc-dot-annotate { background: #22c55e; }
    .vc-dot-transform { background: #f59e0b; }
    .vc-dot-swap { background: #a78bfa; }
    .vc-dot-textedit { background: #38bdf8; }
    .vc-actions { display: flex; gap: 5px; flex-wrap: wrap; }
    .vc-actions button {
      padding: 5px 10px;
      border: 1px solid rgba(71, 85, 105, 0.5);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.6);
      color: #94a3b8;
      cursor: pointer;
      font: 11px/1 ui-sans-serif, system-ui, sans-serif;
      font-weight: 500;
      transition: all 120ms ease;
    }
    .vc-actions button.is-on {
      border-color: rgba(96, 165, 250, 0.5);
      background: rgba(29, 78, 216, 0.2);
      color: #60a5fa;
    }
    .vc-actions button.is-danger {
      border-color: rgba(248, 113, 113, 0.6);
      background: rgba(248, 113, 113, 0.15);
      color: #fca5a5;
    }
    .vc-actions button:hover { border-color: rgba(96, 165, 250, 0.4); color: #e2e8f0; }
    .vc-panel-footer {
      padding: 8px 12px 10px;
      border-top: 1px solid rgba(96, 165, 250, 0.08);
      display: grid;
      gap: 3px;
    }
    .vc-panel em, .vc-panel span { color: #64748b; font-style: normal; font-size: 11px; }
    .vc-panel span.vc-status { color: #93c5fd; }
    .vc-count { font-size: 11px; color: #475569; }
    .vc-count strong { color: #60a5fa; }

    /* ── HIGHLIGHT / SELECTION ──────────────────────────── */
    .vc-highlight {
      position: fixed;
      box-sizing: border-box;
      border: 1.5px solid rgba(96, 165, 250, 0.8);
      border-radius: 5px;
      background: rgba(96, 165, 250, 0.07);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 2147480000;
    }
    .vc-selected {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #facc15;
      border-radius: 5px;
      background: rgba(250, 204, 21, 0.07);
      box-shadow:
        0 0 0 4px rgba(250, 204, 21, 0.12),
        0 0 20px rgba(250, 204, 21, 0.15);
      pointer-events: none;
      z-index: 2147481000;
    }

    /* ── TRANSFORM BOX ──────────────────────────────────── */
    .vc-transform-box {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #f59e0b;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.08);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
      z-index: 2147481000;
      pointer-events: auto;
    }
    .vc-transform-drag {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      cursor: move;
    }
    .vc-transform-handle {
      position: absolute;
      width: 12px;
      height: 12px;
      padding: 0 !important;
      border-radius: 3px !important;
      background: #f59e0b !important;
      border: 2px solid #020617 !important;
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
    }
    .vc-nw { left: -7px; top: -7px; cursor: nwse-resize !important; }
    .vc-ne { right: -7px; top: -7px; cursor: nesw-resize !important; }
    .vc-sw { left: -7px; bottom: -7px; cursor: nesw-resize !important; }
    .vc-se { right: -7px; bottom: -7px; cursor: nwse-resize !important; }

    /* ── POPUPS ─────────────────────────────────────────── */
    .vc-transform-form,
    .vc-annotate-popup {
      position: fixed;
      z-index: 2147483000;
      width: 280px;
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid rgba(96, 165, 250, 0.2);
      border-radius: 16px;
      background: rgba(8, 15, 32, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: #f8fafc;
      box-shadow: 0 20px 60px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(96, 165, 250, 0.06);
      font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: auto;
    }
    .vc-transform-form strong,
    .vc-annotate-popup strong {
      color: #93c5fd;
      font-weight: 700;
      font-size: 13px;
    }
    .vc-transform-form button,
    .vc-annotate-popup button {
      padding: 7px 14px;
      border: 1px solid rgba(71, 85, 105, 0.6);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.8);
      color: #e2e8f0;
      cursor: pointer;
      font: 12px/1 ui-sans-serif, system-ui, sans-serif;
      font-weight: 500;
      transition: all 120ms ease;
    }
    .vc-transform-form button:hover,
    .vc-annotate-popup button:hover {
      border-color: rgba(96, 165, 250, 0.5);
      background: rgba(30, 41, 59, 0.9);
    }
    .vc-transform-form button[type="submit"],
    .vc-annotate-popup button[type="submit"] {
      background: #1d4ed8;
      border-color: #2563eb;
      color: #fff;
    }
    .vc-transform-form button[type="submit"]:hover,
    .vc-annotate-popup button[type="submit"]:hover {
      background: #2563eb;
    }
    .vc-transform-form textarea,
    .vc-annotate-popup textarea {
      min-height: 72px;
      resize: vertical;
      border: 1px solid rgba(71, 85, 105, 0.5);
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.9);
      color: #f1f5f9;
      font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
      padding: 9px 11px;
      outline: none;
      transition: border-color 120ms ease;
    }
    .vc-transform-form textarea:focus,
    .vc-annotate-popup textarea:focus {
      border-color: rgba(96, 165, 250, 0.6);
    }
    .vc-popup-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .vc-transform-form small,
    .vc-annotate-popup small { color: #475569; font-size: 11px; }
    .vc-warning { color: #fbbf24 !important; }

    /* Simplified annotate popup — just textarea */
    .vc-popup-simple {
      width: 240px;
      padding: 6px;
      gap: 0;
    }
    .vc-popup-simple textarea {
      min-height: 60px;
      border: none;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.95);
      color: #f1f5f9;
      font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
      padding: 9px 11px;
      outline: none;
      resize: vertical;
      box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.15);
      transition: box-shadow 120ms ease;
    }
    .vc-popup-simple textarea:focus {
      box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.4);
    }
    .vc-panel span.vc-info { color: #64748b; font-style: normal; font-size: 11px; }
  `;
  const rootEl = document.createElement('div');
  shadowRoot.append(style, rootEl);
  (document.body || document.documentElement).appendChild(host);
  createRoot(rootEl).render(<OverlayRoot shadowHostEl={host} />);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  main() {
    if (!isAllowedPage()) return;
    mountOverlay();
  },
});
