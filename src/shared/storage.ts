import type { Annotation } from './types';

export type ThemePreference = 'dark' | 'light';
export type DefaultToolPreference = 'annotate' | 'transform' | 'swap' | 'text-edit';

export interface BolitaPosition {
  x: number;
  y: number;
}

export interface VibelaPrefs {
  version: 1;
  theme: ThemePreference;
  defaultTool: DefaultToolPreference;
  activateOnLoad: boolean;
  bolitaPosition?: BolitaPosition;
}

export interface AnnotationDraftStore {
  version: 1;
  updatedAt: number;
  annotations: Annotation[];
}

const DEFAULT_PREFS: VibelaPrefs = {
  version: 1,
  theme: 'dark',
  defaultTool: 'annotate',
  activateOnLoad: false,
};

export function overlayActiveKey(tabId: number): string {
  return `overlayActive:${tabId}`;
}

export function annotationDraftsKey(tabId: number, origin = window.location.origin): string {
  return `annotations:${tabId}:${origin}`;
}

export async function getOverlayActive(tabId: number): Promise<boolean> {
  const key = overlayActiveKey(tabId);
  const values = await chrome.storage.session.get(key);
  return Boolean(values[key]);
}

export async function setOverlayActive(tabId: number, active: boolean): Promise<void> {
  await chrome.storage.session.set({ [overlayActiveKey(tabId)]: active });
}

export async function getPrefs(): Promise<VibelaPrefs> {
  const values = await chrome.storage.sync.get('prefs');
  return { ...DEFAULT_PREFS, ...(values.prefs ?? {}), version: 1 };
}

export async function setPrefs(prefs: Partial<VibelaPrefs>): Promise<void> {
  await chrome.storage.sync.set({ prefs: { ...(await getPrefs()), ...prefs, version: 1 } });
}

export async function getAnnotationDrafts(tabId: number, origin = window.location.origin): Promise<AnnotationDraftStore> {
  const key = annotationDraftsKey(tabId, origin);
  const values = await chrome.storage.local.get(key) as Record<string, AnnotationDraftStore | undefined>;
  return values[key] ?? { version: 1, updatedAt: Date.now(), annotations: [] };
}

export async function setAnnotationDrafts(tabId: number, annotations: Annotation[], origin = window.location.origin): Promise<void> {
  const key = annotationDraftsKey(tabId, origin);
  await chrome.storage.local.set({ [key]: { version: 1, updatedAt: Date.now(), annotations: annotations.slice(-50) } });
}
