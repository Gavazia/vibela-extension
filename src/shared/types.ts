export interface ViewportSize {
  w: number;
  h: number;
}

export interface ViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RawStyles {
  bg: string;
  color: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
  borderRadius: string;
  display: string;
  position: string;
}

export interface ElementInfo {
  tag: string;
  classes: string;
  text: string;
  label: string;
  parentTag: string;
  twClasses: string[];
  rawStyles: RawStyles;
  rect: ViewportRect;
}

interface BaseAnnotation {
  id: string;
  createdAt: number;
  elementInfo: ElementInfo;
  comment?: string;
}

export interface AnnotateRecord extends BaseAnnotation {
  type: 'annotate';
  screenshot?: string;
}

export interface TransformRecord extends BaseAnnotation {
  type: 'transform';
  transform: {
    dx: number;
    dy: number;
    origW: number;
    origH: number;
    newW: number;
    newH: number;
  };
  screenshotBefore?: string;
  screenshotAfter?: string;
}

export interface SwapRecord extends BaseAnnotation {
  type: 'swap';
  targetInfo: ElementInfo;
}

export interface TextEditRecord extends BaseAnnotation {
  type: 'text-edit';
  originalText: string;
  newText: string;
  screenshot?: string;
}

export type Annotation = AnnotateRecord | TransformRecord | SwapRecord | TextEditRecord;

export interface PromptMeta {
  date?: string;
  pathname?: string;
  viewport?: ViewportSize;
}

export interface ExportBundle {
  prompt: string;
  assets: Array<{ filename: string; dataUrl: string }>;
  meta: { pathname: string; viewport: ViewportSize; date: string };
}

export interface ExtError {
  code: 'RESTRICTED_URL' | 'CAPTURE_FAILED' | 'DOWNLOAD_FAILED' | 'INVALID_STATE' | 'UNKNOWN';
  message: string;
}

export type ExtResponse<T> = { ok: true; payload: T } | { ok: false; error: ExtError };

// ---------------------------------------------------------------------------
// Vibela feedback-loop types
// ---------------------------------------------------------------------------

export interface AnnotateDetails {
  // No additional fields — screenshotPath in common block holds the screenshot.
}

export interface TransformDetails {
  dx: number;
  dy: number;
  origW: number;
  origH: number;
  newW: number;
  newH: number;
  screenshotBefore: string | null;
  screenshotAfter: string | null;
}

export interface SwapDetails {
  targetSelector: string;
  targetBoundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  targetText: string | null;
}

export interface TextEditDetails {
  originalText: string;
  newText: string;
}

export interface VibelaTask {
  id: string;
  type: 'annotate' | 'transform' | 'swap' | 'text-edit';
  status: 'to do' | 'doing' | 'done' | 'failed';
  title: string;
  comment: string | null;
  selector: string;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  screenshotPath: string | null;
  screenshotPaths?: { before?: string; after?: string };
  timestamp: string;
  pathname: string;
  details: AnnotateDetails | TransformDetails | SwapDetails | TextEditDetails;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnect' | 'unsupported';

export interface ConnectResult {
  path: string;
}

export interface RestoreResult {
  state: 'connected' | 'reconnect' | 'disconnected';
  path?: string;
}

export interface SyncResult {
  count: number;
  error: string | null;
}
