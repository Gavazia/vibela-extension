/**
 * Unit tests for projectSync.sync() — T-15 (ADR-8, REQ-2.3–REQ-2.8, SC-5, SC-6, SC-7, SC-9)
 *
 * Uses an in-memory mock FileSystemDirectoryHandle so no browser / OS dialog is needed.
 * Tests verify:
 *   - tasks.json content (schema, count, dedup)
 *   - tasks.md content (header stats, checkboxes)
 *   - stream.jsonl append semantics (only incoming batch appended, never truncated)
 *   - screenshots written (annotate, text-edit, transform before/after)
 *   - dedup: preserves non-"to do" status on re-sync (SC-6)
 *   - not-connected result when no handle is stored (SC-7)
 *
 * NOTE: window.showDirectoryPicker() and the OS permission dialog cannot be automated.
 * Those paths require manual verification — see apply-progress for the checklist.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  AnnotateRecord,
  TransformRecord,
  SwapRecord,
  TextEditRecord,
  VibelaTask,
} from '../types';

// ---------------------------------------------------------------------------
// In-memory mock File System (minimal — enough for sync() to work)
// ---------------------------------------------------------------------------

interface MockFile {
  content: Uint8Array<ArrayBuffer>;
}

// MockEntry is the union stored inside a MockDir's children map.
type MockEntry = MockFile | MockDir;
type MockFS = Map<string, MockEntry>;
interface MockDir {
  type: 'dir';
  children: MockFS;
}

function createMockDir(children?: MockFS): MockDir {
  return { type: 'dir', children: children ?? new Map<string, MockEntry>() };
}

function makeMockDirectoryHandle(dir: MockDir): FileSystemDirectoryHandle {
  const handle: FileSystemDirectoryHandle = {
    kind: 'directory',
    name: 'root',
    isSameEntry: async () => false,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',

    getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
      let child = dir.children.get(name);
      if (!child) {
        if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
        child = createMockDir();
        dir.children.set(name, child);
      }
      if ((child as MockDir).type !== 'dir') throw new DOMException(`${name} is a file`, 'TypeMismatchError');
      return Promise.resolve(makeMockDirectoryHandle(child as MockDir));
    },

    getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle> {
      let entry = dir.children.get(name);
      if (!entry) {
        if (!opts?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
        entry = { content: new Uint8Array() };
        dir.children.set(name, entry);
      }
      const file = entry as MockFile;

      const fileHandle: FileSystemFileHandle = {
        kind: 'file',
        name,
        isSameEntry: async () => false,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        getFile(): Promise<File> {
          const blob = new Blob([file.content]);
          const f = new File([blob], name);
          // Attach .size for seek
          Object.defineProperty(f, 'size', { get: () => file.content.length });
          return Promise.resolve(f);
        },
        createWritable(opts?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream> {
          const keepExisting = opts?.keepExistingData ?? false;
          let buf: Uint8Array<ArrayBuffer> = keepExisting
            ? new Uint8Array(file.content.buffer.slice(0) as ArrayBuffer)
            : new Uint8Array(new ArrayBuffer(0));
          let seekPos = keepExisting ? file.content.length : 0;

          const writable: FileSystemWritableFileStream = {
            locked: false,
            seek(position: number): Promise<void> {
              seekPos = position;
              return Promise.resolve();
            },
            write(data: BufferSource | string | Blob | WriteParams): Promise<void> {
              let bytes: Uint8Array<ArrayBuffer>;
              if (typeof data === 'string') {
                const encoded = new TextEncoder().encode(data);
                bytes = new Uint8Array(encoded.buffer.slice(0) as ArrayBuffer);
              } else if (data instanceof Uint8Array) {
                bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
              } else if (data instanceof ArrayBuffer) {
                bytes = new Uint8Array(data);
              } else if (ArrayBuffer.isView(data)) {
                bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
              } else {
                // WriteParams or Blob — not tested in this suite
                bytes = new Uint8Array(new ArrayBuffer(0));
              }
              const ab = new ArrayBuffer(seekPos + bytes.length);
              const newBuf = new Uint8Array(ab);
              newBuf.set(buf.slice(0, seekPos));
              newBuf.set(bytes, seekPos);
              buf = newBuf;
              seekPos += bytes.length;
              return Promise.resolve();
            },
            close(): Promise<void> {
              file.content = new Uint8Array(buf.buffer.slice(0) as ArrayBuffer);
              return Promise.resolve();
            },
            abort(): Promise<void> {
              return Promise.resolve();
            },
            getWriter() {
              throw new Error('getWriter not implemented in mock');
            },
          } as unknown as FileSystemWritableFileStream;
          return Promise.resolve(writable);
        },
      } as unknown as FileSystemFileHandle;

      return Promise.resolve(fileHandle);
    },
    resolve: async () => null,
    entries: async function* () {},
    keys: async function* () {},
    values: async function* () {},
    [Symbol.asyncIterator]: async function* () {},
  } as unknown as FileSystemDirectoryHandle;

  return handle;
}

// ---------------------------------------------------------------------------
// Mock handleStore so sync() can find a stored handle
// ---------------------------------------------------------------------------

// We intercept the handleStore module to inject our mock FS.
// projectSync is imported AFTER vi.mock() is hoisted by Vitest.
vi.mock('../handleStore', async () => {
  let storedRecord: { handle: FileSystemDirectoryHandle; path: string } | null = null;
  return {
    save: vi.fn(async (handle: FileSystemDirectoryHandle, path: string) => {
      storedRecord = { handle, path };
    }),
    load: vi.fn(async () => storedRecord),
    clear: vi.fn(async () => {
      storedRecord = null;
    }),
    __setStored: (record: { handle: FileSystemDirectoryHandle; path: string } | null) => {
      storedRecord = record;
    },
  };
});

import * as handleStore from '../handleStore';
import { sync } from '../projectSync';

// Helper: read a text file from the mock FS
function readFile(dir: MockDir, ...path: string[]): string {
  let current: MockFS = dir.children;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i]!;
    const node = current.get(part);
    if (!node || (node as MockDir).type !== 'dir') throw new Error(`Dir ${part} not found`);
    current = (node as MockDir).children;
  }
  const name = path[path.length - 1]!;
  const file = current.get(name) as MockFile | undefined;
  if (!file) throw new Error(`File ${name} not found`);
  return new TextDecoder().decode(file.content);
}

function fileExists(dir: MockDir, ...path: string[]): boolean {
  try {
    readFile(dir, ...path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ELEMENT_INFO = {
  tag: 'button',
  classes: 'cta-primary',
  text: 'Save',
  label: '',
  parentTag: 'div',
  twClasses: [],
  rawStyles: { bg: '', color: '', fontSize: '', fontWeight: '', padding: '', borderRadius: '', display: '', position: '' },
  rect: { top: 10, left: 20, width: 100, height: 50 },
};

// Minimal valid 1×1 transparent PNG encoded as base64.
// Generated via: Buffer.from(require('fs').readFileSync('1x1.png')).toString('base64')
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

const ANNOTATE: AnnotateRecord = {
  id: 'ann-001',
  createdAt: 1000,
  type: 'annotate',
  elementInfo: BASE_ELEMENT_INFO,
  comment: 'Make this button larger',
  screenshot: TINY_PNG_DATA_URL,
};

const TRANSFORM: TransformRecord = {
  id: 'trn-001',
  createdAt: 2000,
  type: 'transform',
  elementInfo: BASE_ELEMENT_INFO,
  comment: 'Move right',
  transform: { dx: 10, dy: 0, origW: 100, origH: 50, newW: 110, newH: 50 },
  screenshotBefore: TINY_PNG_DATA_URL,
  screenshotAfter: TINY_PNG_DATA_URL,
};

const SWAP: SwapRecord = {
  id: 'swp-001',
  createdAt: 3000,
  type: 'swap',
  elementInfo: BASE_ELEMENT_INFO,
  targetInfo: { ...BASE_ELEMENT_INFO, tag: 'span', classes: 'label' },
};

const TEXT_EDIT: TextEditRecord = {
  id: 'txt-001',
  createdAt: 4000,
  type: 'text-edit',
  elementInfo: BASE_ELEMENT_INFO,
  originalText: 'Save',
  newText: 'Save changes',
  comment: 'Update CTA copy',
  screenshot: TINY_PNG_DATA_URL,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFile(text: string): MockFile {
  const encoded = new TextEncoder().encode(text);
  return { content: new Uint8Array(encoded.buffer.slice(0) as ArrayBuffer) };
}

function buildMockRoot(): MockDir {
  // Minimal scaffold: .vibela/ with screenshots/ sub-dir and empty data files
  const screenshotsDir = createMockDir();
  const vibelaChildren: MockFS = new Map<string, MockEntry>([
    ['screenshots', screenshotsDir],
    ['tasks.json', makeFile('[]')],
    ['tasks.md', makeFile('# Vibela Tasks\n')],
    ['stream.jsonl', makeFile('')],
  ]);
  const vibelaDir = createMockDir(vibelaChildren);
  const rootChildren: MockFS = new Map<string, MockEntry>([
    ['.vibela', vibelaDir],
  ]);
  return createMockDir(rootChildren);
}

function injectHandle(mockRoot: MockDir, path = 'my-project') {
  const handle = makeMockDirectoryHandle(mockRoot);
  (handleStore as unknown as { __setStored: (r: { handle: FileSystemDirectoryHandle; path: string }) => void }).__setStored({ handle, path });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projectSync.sync()', () => {
  let mockRoot: MockDir;

  beforeEach(() => {
    mockRoot = buildMockRoot();
  });

  // -------------------------------------------------------------------------
  // SC-7: No connection
  // -------------------------------------------------------------------------

  it('returns not-connected when no handle is stored', async () => {
    (handleStore as unknown as { __setStored: (r: null) => void }).__setStored(null);

    const result = await sync([ANNOTATE]);

    expect(result).toEqual({ count: 0, total: 0, error: 'not-connected' });
  });

  // -------------------------------------------------------------------------
  // SC-5: Sync with a batch of annotations
  // -------------------------------------------------------------------------

  it('writes tasks.json with correct task count on first sync', async () => {
    injectHandle(mockRoot);

    const result = await sync([ANNOTATE, SWAP]);

    expect(result).toEqual({ count: 2, total: 2, error: null });

    const json = readFile(mockRoot, '.vibela', 'tasks.json');
    const tasks: VibelaTask[] = JSON.parse(json);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.id).toBe('ann-001');
    expect(tasks[0]!.type).toBe('annotate');
    expect(tasks[0]!.status).toBe('to do');
    expect(tasks[1]!.id).toBe('swp-001');
    expect(tasks[1]!.type).toBe('swap');
  });

  it('writes tasks.md with correct stats header', async () => {
    injectHandle(mockRoot);

    await sync([ANNOTATE, SWAP]);

    const md = readFile(mockRoot, '.vibela', 'tasks.md');
    expect(md).toContain('# Vibela Tasks');
    expect(md).toContain('**Total**: 2');
    expect(md).toContain('**To Do**: 2');
    expect(md).toContain('**Doing**: 0');
    expect(md).toContain('**Done**: 0');
    expect(md).toContain('**Failed**: 0');
  });

  it('sets all new tasks to status "to do"', async () => {
    injectHandle(mockRoot);

    await sync([ANNOTATE, TRANSFORM, SWAP, TEXT_EDIT]);

    const tasks: VibelaTask[] = JSON.parse(readFile(mockRoot, '.vibela', 'tasks.json'));
    expect(tasks.every((t) => t.status === 'to do')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // SC-6: Re-sync deduplication — preserves non-"to do" status
  // -------------------------------------------------------------------------

  it('preserves non-"to do" status on dedup merge', async () => {
    // Pre-populate tasks.json with ann-001 at status "done"
    const existingTask: VibelaTask = {
      id: 'ann-001',
      type: 'annotate',
      status: 'done',
      title: 'old title',
      comment: 'old comment',
      selector: 'button',
      boundingRect: { top: 0, left: 0, width: 1, height: 1 },
      screenshotPath: null,
      timestamp: new Date(0).toISOString(),
      pathname: '/old',
      details: {},
    };
    const vibelaDir = (mockRoot.children.get('.vibela') as MockDir);
    vibelaDir.children.set('tasks.json', makeFile(JSON.stringify([existingTask])));

    injectHandle(mockRoot);

    // Re-sync the same annotation — it already exists in tasks.json, so it is
    // NOT counted as new (count reports new tasks only; total is the merged set).
    const result = await sync([ANNOTATE]);
    expect(result).toEqual({ count: 0, total: 1, error: null });

    const tasks: VibelaTask[] = JSON.parse(readFile(mockRoot, '.vibela', 'tasks.json'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe('ann-001');
    // Status MUST be preserved
    expect(tasks[0]!.status).toBe('done');
    // Other fields updated from the incoming annotation
    expect(tasks[0]!.type).toBe('annotate');
  });

  it('appends a new task when id is different', async () => {
    const existingTask: VibelaTask = {
      id: 'existing-999',
      type: 'annotate',
      status: 'done',
      title: 'existing',
      comment: null,
      selector: 'div',
      boundingRect: { top: 0, left: 0, width: 1, height: 1 },
      screenshotPath: null,
      timestamp: new Date(0).toISOString(),
      pathname: '/',
      details: {},
    };
    const vibelaDir = (mockRoot.children.get('.vibela') as MockDir);
    vibelaDir.children.set('tasks.json', makeFile(JSON.stringify([existingTask])));

    injectHandle(mockRoot);

    await sync([ANNOTATE]);

    const tasks: VibelaTask[] = JSON.parse(readFile(mockRoot, '.vibela', 'tasks.json'));
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.id).toBe('existing-999'); // preserved first
    expect(tasks[1]!.id).toBe('ann-001');      // new one appended
  });

  // -------------------------------------------------------------------------
  // REQ-2.5: stream.jsonl append — only incoming batch, not all tasks
  // -------------------------------------------------------------------------

  it('appends one line per incoming annotation to stream.jsonl', async () => {
    injectHandle(mockRoot);

    await sync([ANNOTATE, SWAP]);

    const streamContent = readFile(mockRoot, '.vibela', 'stream.jsonl');
    const lines = streamContent.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.event).toBe('sync');
    expect(first.taskId).toBe('ann-001');
    expect(first.type).toBe('annotate');
    expect(typeof first.ts).toBe('string');

    const second = JSON.parse(lines[1]!);
    expect(second.taskId).toBe('swp-001');
  });

  it('does NOT truncate existing stream.jsonl content on re-sync', async () => {
    // Seed the stream with an existing line
    const existingLine = JSON.stringify({ ts: new Date(0).toISOString(), event: 'sync', taskId: 'old-task', type: 'annotate' });
    const vibelaDir = (mockRoot.children.get('.vibela') as MockDir);
    vibelaDir.children.set('stream.jsonl', makeFile(existingLine + '\n'));

    injectHandle(mockRoot);
    await sync([ANNOTATE]);

    const streamContent = readFile(mockRoot, '.vibela', 'stream.jsonl');
    const lines = streamContent.split('\n').filter(Boolean);
    // Must have the old line PLUS the new one
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toBe(existingLine);
    expect(JSON.parse(lines[lines.length - 1]!).taskId).toBe('ann-001');
  });

  it('does NOT append duplicate stream events when re-syncing an already-synced annotation', async () => {
    injectHandle(mockRoot);

    // First sync writes the task and one stream line.
    await sync([ANNOTATE]);
    // Second sync of the same draft batch must not add another event.
    const result = await sync([ANNOTATE]);

    const streamContent = readFile(mockRoot, '.vibela', 'stream.jsonl');
    const lines = streamContent.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).taskId).toBe('ann-001');
    expect(result).toEqual({ count: 0, total: 1, error: null });
  });

  // -------------------------------------------------------------------------
  // REQ-2.6: screenshot writes
  // -------------------------------------------------------------------------

  it('writes annotate screenshot to .vibela/screenshots/<id>.png', async () => {
    injectHandle(mockRoot);

    await sync([ANNOTATE]);

    expect(fileExists(mockRoot, '.vibela', 'screenshots', 'ann-001.png')).toBe(true);
  });

  it('writes text-edit screenshot to .vibela/screenshots/<id>.png', async () => {
    injectHandle(mockRoot);

    await sync([TEXT_EDIT]);

    expect(fileExists(mockRoot, '.vibela', 'screenshots', 'txt-001.png')).toBe(true);
  });

  it('writes transform before/after screenshots to .vibela/screenshots/', async () => {
    injectHandle(mockRoot);

    await sync([TRANSFORM]);

    expect(fileExists(mockRoot, '.vibela', 'screenshots', 'trn-001-before.png')).toBe(true);
    expect(fileExists(mockRoot, '.vibela', 'screenshots', 'trn-001-after.png')).toBe(true);
  });

  it('does NOT write a screenshot for swap (no screenshot on SwapRecord)', async () => {
    injectHandle(mockRoot);

    await sync([SWAP]);

    const screenshotsDir = ((mockRoot.children.get('.vibela') as MockDir).children.get('screenshots') as MockDir);
    // No swap screenshot files
    expect(screenshotsDir.children.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // SC-9: TransformRecord schema correctness
  // -------------------------------------------------------------------------

  it('writes correct details block for TransformRecord (SC-9)', async () => {
    injectHandle(mockRoot);

    await sync([TRANSFORM]);

    const tasks: VibelaTask[] = JSON.parse(readFile(mockRoot, '.vibela', 'tasks.json'));
    const task = tasks[0]!;

    expect(task.type).toBe('transform');
    expect(task.screenshotPath).toBeNull();
    const d = task.details as { dx: number; dy: number; origW: number; newW: number; screenshotBefore: string; screenshotAfter: string };
    expect(d.dx).toBe(10);
    expect(d.origW).toBe(100);
    expect(d.newW).toBe(110);
    expect(d.screenshotBefore).toBe('./screenshots/trn-001-before.png');
    expect(d.screenshotAfter).toBe('./screenshots/trn-001-after.png');
  });

  // -------------------------------------------------------------------------
  // SC-10: SwapRecord schema — no screenshot, comment: null when absent
  // -------------------------------------------------------------------------

  it('writes null screenshotPath and null comment for SwapRecord without comment (SC-10)', async () => {
    injectHandle(mockRoot);

    await sync([SWAP]);

    const tasks: VibelaTask[] = JSON.parse(readFile(mockRoot, '.vibela', 'tasks.json'));
    const task = tasks[0]!;
    expect(task.type).toBe('swap');
    expect(task.screenshotPath).toBeNull();
    expect(task.comment).toBeNull();
  });

  // -------------------------------------------------------------------------
  // tasks.md checkbox mapping
  // -------------------------------------------------------------------------

  it('renders [ ] checkbox for to-do tasks in tasks.md', async () => {
    injectHandle(mockRoot);

    await sync([ANNOTATE]);

    const md = readFile(mockRoot, '.vibela', 'tasks.md');
    expect(md).toContain('- [ ]');
  });

  it('renders [x] checkbox for done tasks preserved via dedup', async () => {
    const existingTask: VibelaTask = {
      id: 'ann-001',
      type: 'annotate',
      status: 'done',
      title: 'annotate: button.cta-primary',
      comment: 'done',
      selector: 'button.cta-primary',
      boundingRect: { top: 10, left: 20, width: 100, height: 50 },
      screenshotPath: null,
      timestamp: new Date(1000).toISOString(),
      pathname: '/',
      details: {},
    };
    const vibelaDir = (mockRoot.children.get('.vibela') as MockDir);
    vibelaDir.children.set('tasks.json', makeFile(JSON.stringify([existingTask])));

    injectHandle(mockRoot);
    await sync([ANNOTATE]);

    const md = readFile(mockRoot, '.vibela', 'tasks.md');
    expect(md).toContain('- [x]');
  });

  // -------------------------------------------------------------------------
  // Return value
  // -------------------------------------------------------------------------

  it('returns count equal to the number of incoming annotations', async () => {
    injectHandle(mockRoot);

    const result = await sync([ANNOTATE, TRANSFORM, SWAP, TEXT_EDIT]);

    expect(result.count).toBe(4);
    expect(result.error).toBeNull();
  });

  it('returns count = 0 with error: null when annotations is empty', async () => {
    injectHandle(mockRoot);

    const result = await sync([]);

    expect(result.count).toBe(0);
    expect(result.error).toBeNull();
  });
});
