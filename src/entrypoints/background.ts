import { defineBackground } from 'wxt/utils/define-background';
import {
  fail,
  ok,
  type CaptureVisibleTabRequest,
  type ExtensionRequest,
} from '../shared/messaging';

const TOGGLE_MESSAGE = 'VIBE_COPILOT_TOGGLE';
const GET_STATE_MESSAGE = 'VIBE_COPILOT_GET_STATE';
const POPUP_STATE_MESSAGE = 'VIBE_COPILOT_POPUP_STATE';
const POPUP_TOGGLE_MESSAGE = 'VIBE_COPILOT_POPUP_TOGGLE';

type ToggleResponse = { ok: true } | { ok: false; reason: string };
const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'moz-extension:',
  'devtools:',
  'view-source:',
];

function isAllowedUrl(url?: string): boolean {
  if (!url) return false;
  try {
    return !RESTRICTED_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function stateKey(tabId: number): string {
  return `overlayActive:${tabId}`;
}

async function readActive(tabId: number): Promise<boolean> {
  const values = await chrome.storage.session.get(stateKey(tabId));
  return Boolean(values[stateKey(tabId)]);
}

async function writeActive(tabId: number, active: boolean): Promise<void> {
  await chrome.storage.session.set({ [stateKey(tabId)]: active });
}

async function setBadge(tabId: number, active: boolean | 'restricted' | 'unknown'): Promise<void> {
  const text = active === 'restricted' ? '–' : active === 'unknown' ? '?' : active ? 'ON' : '';
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: active === 'restricted' || active === 'unknown' ? '#6b7280' : '#2563eb' });
}

function waitForContentScriptReady(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 75));
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] });
}

async function sendToggle(tabId: number, active: boolean): Promise<ToggleResponse | undefined> {
  return chrome.tabs.sendMessage(tabId, { type: TOGGLE_MESSAGE, active, tabId }) as Promise<ToggleResponse | undefined>;
}

// chrome.tabs.captureVisibleTab is rate-limited by Chrome to ~2 calls/sec
// (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND). Saving several annotations in quick
// succession overruns that quota and the extra calls reject — historically that
// silently dropped the screenshot. We serialize all capture requests and space
// them out so each call stays under the quota, with one retry as a safety net.
const RATE_LIMIT_HINT = 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND';
const CAPTURE_MIN_INTERVAL_MS = 600;
const CAPTURE_RETRY_DELAY_MS = 700;

let captureChain: Promise<unknown> = Promise.resolve();
let lastCaptureAt = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureOnce(windowId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (url) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(url);
    });
  });
}

/**
 * Run a capture as part of a serialized chain: only one capture is in flight at a
 * time and successive calls are spaced by CAPTURE_MIN_INTERVAL_MS to respect the
 * 2/sec quota. On the rate-limit error specifically, retry once after a short wait.
 */
function scheduleCapture(windowId: number): Promise<string> {
  const run = async (): Promise<string> => {
    const wait = CAPTURE_MIN_INTERVAL_MS - (Date.now() - lastCaptureAt);
    if (wait > 0) await delay(wait);
    try {
      return await captureOnce(windowId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Only the transient rate-limit error is worth waiting on; anything else
      // (restricted page, no window) will not recover by retrying.
      if (!message.includes(RATE_LIMIT_HINT)) throw error;
      await delay(CAPTURE_RETRY_DELAY_MS);
      return captureOnce(windowId);
    } finally {
      lastCaptureAt = Date.now();
    }
  };

  // Chain so requests execute one at a time even when they arrive concurrently.
  const result = captureChain.then(run, run);
  captureChain = result.catch(() => {});
  return result;
}

async function captureVisibleTab(message: CaptureVisibleTabRequest, sender: chrome.runtime.MessageSender) {
  if (!isAllowedUrl(sender.tab?.url)) return fail('RESTRICTED_URL', 'Cannot capture restricted page URL');

  try {
    const windowId = sender.tab?.windowId;
    if (windowId === undefined) return fail('CAPTURE_FAILED', 'Capture request is missing a sender window');
    const dataUrl = await scheduleCapture(windowId);
    if (!dataUrl.startsWith('data:image/png')) return fail('CAPTURE_FAILED', 'Visible tab capture did not return a PNG data URL');
    return ok({
      dataUrl,
      viewport: { ...message.payload.viewport, dpr: message.payload.dpr || 1 },
      capturedAt: Date.now(),
    });
  } catch (error) {
    return fail('CAPTURE_FAILED', error instanceof Error ? error.message : 'Visible tab capture failed');
  }
}

function handleExtensionRequest(message: ExtensionRequest, sender: chrome.runtime.MessageSender) {
  if (message.kind === 'CAPTURE_VISIBLE_TAB_REQUEST') return captureVisibleTab(message, sender);
  return Promise.resolve(fail('UNKNOWN', 'Unknown extension request'));
}

// Annotation drafts are keyed `annotations:<tabId>:<origin>`. Tab ids never
// survive tab close or a browser restart, so those keys orphan silently — and
// with unlimitedStorage they would accumulate forever. Reap them here.
const DRAFT_KEY_PREFIX = 'annotations:';

async function removeDraftKeys(matches: (key: string) => boolean): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((key) => key.startsWith(DRAFT_KEY_PREFIX) && matches(key));
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}

/** Toggle the overlay for a tab; shared by the toolbar action and the popup. */
async function toggleOverlay(tab: chrome.tabs.Tab): Promise<{ active: boolean; allowed: boolean }> {
  if (!tab.id || !isAllowedUrl(tab.url)) {
    if (tab.id) await setBadge(tab.id, 'restricted');
    return { active: false, allowed: false };
  }

  const nextActive = !(await readActive(tab.id));

  try {
    let response: ToggleResponse | undefined;
    try {
      response = await sendToggle(tab.id, nextActive);
    } catch {
      await ensureContentScript(tab.id);
      await waitForContentScriptReady();
      response = await sendToggle(tab.id, nextActive);
    }

    if (!response?.ok) throw new Error(response?.reason || 'content-script-not-ready');

    await writeActive(tab.id, nextActive);
    await setBadge(tab.id, nextActive);
    return { active: nextActive, allowed: true };
  } catch {
    // Some allowed URLs may still reject content scripts (for example file:// without access).
    // Do not claim the overlay is active unless the content script acknowledged the toggle.
    await writeActive(tab.id, false);
    await setBadge(tab.id, 'unknown');
    return { active: false, allowed: true };
  }
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener(async (tab) => {
    await toggleOverlay(tab);
  });

  // Draft GC: per-tab on close, full sweep on browser startup (all old tab ids are gone).
  chrome.tabs.onRemoved.addListener((tabId) => {
    void removeDraftKeys((key) => key.startsWith(`${DRAFT_KEY_PREFIX}${tabId}:`));
  });
  chrome.runtime.onStartup.addListener(() => {
    void removeDraftKeys(() => true);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === GET_STATE_MESSAGE) {
      const tabId = sender.tab?.id;
      if (!tabId || !isAllowedUrl(sender.tab?.url)) {
        sendResponse({ active: false, allowed: false });
        return false;
      }

      readActive(tabId)
        .then((active) => sendResponse({ active, allowed: true, tabId }))
        .catch(() => sendResponse({ active: false, allowed: true, tabId }));
      return true;
    }

    if (message?.kind === 'CAPTURE_VISIBLE_TAB_REQUEST') {
      handleExtensionRequest(message, sender).then(sendResponse);
      return true;
    }

    // Popup messages carry an explicit tabId because popup senders have no tab.
    if (message?.type === POPUP_STATE_MESSAGE && typeof message.tabId === 'number') {
      chrome.tabs.get(message.tabId)
        .then(async (tab) => {
          const allowed = isAllowedUrl(tab.url);
          const active = allowed ? await readActive(message.tabId) : false;
          sendResponse({ active, allowed });
        })
        .catch(() => sendResponse({ active: false, allowed: false }));
      return true;
    }

    if (message?.type === POPUP_TOGGLE_MESSAGE && typeof message.tabId === 'number') {
      chrome.tabs.get(message.tabId)
        .then((tab) => toggleOverlay(tab))
        .then(sendResponse)
        .catch(() => sendResponse({ active: false, allowed: false }));
      return true;
    }

    return false;
  });
});
