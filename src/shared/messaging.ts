import type { ExtError, ExtResponse, ViewportSize } from './types';

export type MessageKind = 'CAPTURE_VISIBLE_TAB_REQUEST';

export interface Envelope<K extends MessageKind, P> {
  kind: K;
  reqId: string;
  payload: P;
}

export interface CaptureVisibleTabPayload {
  viewport: ViewportSize;
  dpr: number;
}

export interface CaptureVisibleTabResult {
  dataUrl: string;
  viewport: ViewportSize & { dpr: number };
  capturedAt: number;
}

export type CaptureVisibleTabRequest = Envelope<'CAPTURE_VISIBLE_TAB_REQUEST', CaptureVisibleTabPayload>;
export type ExtensionRequest = CaptureVisibleTabRequest;

export function createReqId(prefix = 'vc'): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${random}`;
}

export function extError(code: ExtError['code'], message: string): ExtError {
  return { code, message };
}

export function ok<T>(payload: T): ExtResponse<T> {
  return { ok: true, payload };
}

export function fail<T = never>(code: ExtError['code'], message: string): ExtResponse<T> {
  return { ok: false, error: extError(code, message) };
}

export function captureVisibleTabMessage(payload: CaptureVisibleTabPayload): CaptureVisibleTabRequest {
  return { kind: 'CAPTURE_VISIBLE_TAB_REQUEST', reqId: createReqId('capture'), payload };
}

export async function sendExtensionRequest<T>(request: ExtensionRequest): Promise<ExtResponse<T>> {
  return chrome.runtime.sendMessage(request) as Promise<ExtResponse<T>>;
}
