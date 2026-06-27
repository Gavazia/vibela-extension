import type { ExtError, ExtResponse, ViewportRect, ViewportSize } from './types';
import {
  captureVisibleTabMessage,
  fail,
  ok,
  sendExtensionRequest,
  type CaptureVisibleTabResult,
} from './messaging';

export interface CropInput {
  dataUrl: string;
  rect: ViewportRect | DOMRect;
  viewport: ViewportSize;
  dpr: number;
}

export interface CropResult {
  dataUrl: string;
  sourceRect: ViewportRect;
  clippedRect: ViewportRect;
}

function toViewportRect(rect: ViewportRect | DOMRect): ViewportRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function clipRect(rect: ViewportRect, viewport: ViewportSize): ViewportRect | null {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewport.w, rect.left + rect.width);
  const bottom = Math.min(viewport.h, rect.top + rect.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read cropped image'));
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(dataUrl: string): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in globalThis) {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode screenshot'));
    image.src = dataUrl;
  });
}

async function canvasToDataUrl(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<string> {
  if ('convertToBlob' in canvas) {
    return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
  }
  return (canvas as HTMLCanvasElement).toDataURL('image/png');
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if ('OffscreenCanvas' in globalThis) return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function cropVisibleTabPng(input: CropInput): Promise<ExtResponse<CropResult>> {
  const sourceRect = toViewportRect(input.rect);
  const clippedRect = clipRect(sourceRect, input.viewport);
  if (!clippedRect) return fail('CAPTURE_FAILED', 'Element outside viewport');

  const dpr = input.dpr || 1;
  const sx = Math.round(clippedRect.left * dpr);
  const sy = Math.round(clippedRect.top * dpr);
  const sw = Math.max(1, Math.round(clippedRect.width * dpr));
  const sh = Math.max(1, Math.round(clippedRect.height * dpr));

  try {
    const image = await decodeImage(input.dataUrl);
    const canvas = createCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return fail('CAPTURE_FAILED', 'Canvas 2D context unavailable');
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    if ('close' in image) image.close();
    return ok({ dataUrl: await canvasToDataUrl(canvas), sourceRect, clippedRect });
  } catch (error) {
    return fail('CAPTURE_FAILED', error instanceof Error ? error.message : 'Failed to crop screenshot');
  }
}

export async function captureAndCropRect(rect: ViewportRect | DOMRect): Promise<ExtResponse<CropResult>> {
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const dpr = window.devicePixelRatio || 1;
  const capture = await sendExtensionRequest<CaptureVisibleTabResult>(captureVisibleTabMessage({ viewport, dpr }));
  if (!capture.ok) return capture as ExtResponse<CropResult>;
  return cropVisibleTabPng({ dataUrl: capture.payload.dataUrl, viewport, dpr: capture.payload.viewport.dpr, rect });
}

export interface HighlightOptions {
  /** Stroke color of the location box. */
  color?: string;
  /** Stroke width in CSS px (scaled by dpr internally). */
  lineWidth?: number;
  /** Opacity of the dim applied to everything outside the element (0 disables). */
  dim?: number;
}

/**
 * Captures the full visible viewport (NOT cropped to the element) and draws a
 * highlight box over the annotated element's rect, dimming the rest so its
 * location on the page is obvious. Used for annotate/location screenshots.
 */
export async function captureViewportWithHighlight(
  rect: ViewportRect | DOMRect,
  options: HighlightOptions = {},
): Promise<ExtResponse<{ dataUrl: string }>> {
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const dpr = window.devicePixelRatio || 1;
  const capture = await sendExtensionRequest<CaptureVisibleTabResult>(captureVisibleTabMessage({ viewport, dpr }));
  if (!capture.ok) return capture as ExtResponse<{ dataUrl: string }>;

  const scale = capture.payload.viewport.dpr || dpr;
  try {
    const image = await decodeImage(capture.payload.dataUrl);
    const iw = (image as ImageBitmap).width || (image as HTMLImageElement).naturalWidth;
    const ih = (image as ImageBitmap).height || (image as HTMLImageElement).naturalHeight;
    const canvas = createCanvas(iw, ih);
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return fail('CAPTURE_FAILED', 'Canvas 2D context unavailable');
    ctx.drawImage(image as CanvasImageSource, 0, 0);
    if ('close' in image) image.close();

    const r = toViewportRect(rect);
    const x = r.left * scale;
    const y = r.top * scale;
    const w = Math.max(1, r.width * scale);
    const h = Math.max(1, r.height * scale);

    // Dim everything except the element (even-odd rule punches a hole).
    const dim = options.dim ?? 0.45;
    if (dim > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(8, 10, 20, ${dim})`;
      ctx.beginPath();
      ctx.rect(0, 0, iw, ih);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Location box around the element.
    const color = options.color ?? '#ff3b6b';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = (options.lineWidth ?? 3) * scale;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * scale;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    return ok({ dataUrl: await canvasToDataUrl(canvas) });
  } catch (error) {
    return fail('CAPTURE_FAILED', error instanceof Error ? error.message : 'Failed to render location screenshot');
  }
}

export function isRecoverableCaptureError(error: ExtError): boolean {
  return error.code === 'CAPTURE_FAILED' || error.code === 'RESTRICTED_URL';
}
