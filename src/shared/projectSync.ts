/**
 * projectSync — File System Access wiring for Vibela.
 *
 * This module is the ONLY place that touches window.showDirectoryPicker,
 * FileSystemDirectoryHandle, and the handleStore IndexedDB wrapper.
 *
 * Exported surface:
 *   isSupported()   — capability guard
 *   connect()       — show picker → scaffold .vibela/ → persist handle
 *   restore()       — load handle from IndexedDB, re-request permission
 *   reconnect()     — requestPermission under gesture; fallback to connect()
 *   disconnect()    — clear IndexedDB entry
 *   sync()          — write annotations batch to .vibela/
 *
 * CONTENT-SCRIPT ONLY: this module uses browser APIs (window.showDirectoryPicker,
 * FileSystemDirectoryHandle, IndexedDB) that are only available in content-script
 * / page context — not in background service workers.
 */

import * as handleStore from './handleStore';
import { annotationToTask, tasksToMarkdown, tasksToStreamLines, mergeTasks } from './vibelaWriter';
import type { Annotation, ConnectResult, RestoreResult, SyncResult, VibelaTask } from './types';

// ?raw imports — Vite 8 / WXT resolves these at bundle time.
// The actual template strings are inlined into the bundle.
import workflowTemplate from '../workflow-templates/vibela-workflow.md?raw';
import commandTemplate  from '../workflow-templates/vibela.md?raw';
// Thin pointer redeployed as each agent's native config file. The full rules
// live ONLY in vibela-workflow.md; every adapter just points here to avoid drift.
import pointerTemplate  from '../workflow-templates/vibela-pointer.md?raw';

// Per-agent frontmatter prepended to the shared agentTemplate body so each
// agent auto-discovers the Vibela workflow in its own native format.
const CLAUDE_SKILL_FRONTMATTER = `---
name: vibela
description: Process Vibela UI annotation tasks from the .vibela/ queue written by the Vibela browser extension. Use when the user runs /vibela, asks to process .vibela/tasks.json, or apply browser UI annotations to code.
---

`;

const CURSOR_RULE_FRONTMATTER = `---
description: Process Vibela UI annotation tasks from the .vibela/ queue.
globs:
  - .vibela/**
  - "**/tasks.json"
  - "**/tasks.md"
alwaysApply: false
---

`;

// Sentinels delimiting the Vibela-managed section inside shared files we co-own
// (AGENTS.md, copilot-instructions.md). On re-sync we replace ONLY this block,
// so user content is preserved and our section stays current (no drift).
const BLOCK_START = '<!-- vibela:start -->';
const BLOCK_END   = '<!-- vibela:end -->';

type AdapterPolicy =
  | 'overwrite'      // dedicated, vibela-named file — safe to fully replace (auto-repair)
  | 'managed-block'; // shared standard file — inject/refresh only our sentinel block

interface AgentAdapter {
  /** Directory path segments from the repo root ([] = root). */
  segments: string[];
  filename: string;
  policy: AdapterPolicy;
  /** Optional frontmatter prepended to the pointer body (overwrite policy only). */
  frontmatter?: string;
}

// Add support for a new IDE/agent by appending ONE entry here (Open/Closed).
const AGENT_ADAPTERS: AgentAdapter[] = [
  // Claude Code — discoverable skill.
  { segments: ['.claude', 'skills', 'vibela'], filename: 'SKILL.md', policy: 'overwrite', frontmatter: CLAUDE_SKILL_FRONTMATTER },
  // Cursor — glob-scoped rule.
  { segments: ['.cursor', 'rules'], filename: 'vibela.mdc', policy: 'overwrite', frontmatter: CURSOR_RULE_FRONTMATTER },
  // Windsurf — workspace rule.
  { segments: ['.windsurf', 'rules'], filename: 'vibela.md', policy: 'overwrite' },
  // Google Antigravity — workspace rule (also reads AGENTS.md below).
  { segments: ['.agent', 'rules'], filename: 'vibela.md', policy: 'overwrite' },
  // Cross-agent standard (Codex, Gemini, Cursor, Windsurf, Zed, Aider, Jules,
  // Antigravity, …) — managed block so we never clobber the user's AGENTS.md.
  { segments: [], filename: 'AGENTS.md', policy: 'managed-block' },
  // GitHub Copilot — managed block.
  { segments: ['.github'], filename: 'copilot-instructions.md', policy: 'managed-block' },
];

// ---------------------------------------------------------------------------
// Capability guard
// ---------------------------------------------------------------------------

/**
 * Returns true when both File System Access API and IndexedDB are available
 * in the current context.
 */
export function isSupported(): boolean {
  return 'showDirectoryPicker' in window && 'indexedDB' in window;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Write a text file into a directory handle.
 * Uses keepExistingData: false so each write is a full replacement.
 */
async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  let writable: FileSystemWritableFileStream;
  try {
    writable = await fileHandle.createWritable({ keepExistingData: false });
  } catch {
    // Some browsers / OS file-lock situations may reject the exclusive mode.
    // Retry without the option (still produces a full overwrite via keepExistingData: false default).
    writable = await fileHandle.createWritable();
  }
  await writable.write(content);
  await writable.close();
}

/**
 * Write a text file only when it does NOT already exist.
 * Used for data files (tasks.json, tasks.md, stream.jsonl) that must not
 * overwrite existing content on reconnect.
 */
async function writeTextFileIfAbsent(
  dir: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  try {
    // getFileHandle without { create: true } throws NotFoundError if absent.
    await dir.getFileHandle(filename, { create: false });
    // File already exists — do not overwrite.
  } catch (err) {
    // Only "absent" should fall through to creation. Any other error (a revoked
    // permission on a stale handle, say) must propagate, not be masked as absence.
    if (err instanceof DOMException && err.name !== 'NotFoundError') throw err;
    await writeTextFile(dir, filename, content);
  }
}

/**
 * Get the human-readable project name from a root handle.
 * Returns the last two path segments if available, otherwise just the name.
 */
function projectName(handle: FileSystemDirectoryHandle): string {
  return handle.name;
}

// ---------------------------------------------------------------------------
// .vibela/ scaffold
// ---------------------------------------------------------------------------

/** Resolve a nested directory path (creating each segment) from a root handle. */
async function nestedDir(
  root: FileSystemDirectoryHandle,
  ...segments: string[]
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/**
 * Insert or refresh the Vibela-managed block inside a shared file, preserving any
 * surrounding user content. Creates the file with just the block when absent.
 */
async function upsertManagedBlock(
  dir: FileSystemDirectoryHandle,
  filename: string,
  body: string,
): Promise<void> {
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}\n`;

  let existing: string | null = null;
  try {
    const fileHandle = await dir.getFileHandle(filename, { create: false });
    existing = await (await fileHandle.getFile()).text();
  } catch (err) {
    // Only "absent" means we create fresh; any other error must propagate.
    if (err instanceof DOMException && err.name !== 'NotFoundError') throw err;
  }

  if (existing === null) {
    await writeTextFile(dir, filename, block);
    return;
  }

  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    // Replace our existing block in place; leave the rest of the file untouched.
    const before = existing.slice(0, start);
    const after = existing.slice(end + BLOCK_END.length);
    await writeTextFile(dir, filename, `${before}${block.trimEnd()}${after}`);
  } else {
    // Append our block, keeping the user's content above it.
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    await writeTextFile(dir, filename, `${existing}${sep}${block}`);
  }
}

/**
 * Deploy the agent-agnostic Vibela workflow so ANY connected agent/IDE discovers
 * it. The full rules live ONLY in .vibela/vibela-workflow.md; every other file is
 * a thin pointer generated from the AGENT_ADAPTERS registry — adding an IDE is one
 * entry, and there is a single source of truth (no content drift).
 *
 *   - 'overwrite' adapters  → dedicated vibela-named files (auto-repair on resync).
 *   - 'managed-block' adapters → shared standard files (AGENTS.md, copilot) where we
 *     touch only our sentinel block and never clobber the user's content.
 */
async function deployWorkflowFiles(
  rootHandle: FileSystemDirectoryHandle,
  vibelaDir: FileSystemDirectoryHandle,
): Promise<void> {
  // Single source of truth — always overwrite.
  await writeTextFile(vibelaDir, 'vibela-workflow.md', workflowTemplate);

  // Claude Code slash command — richer than the pointer, kept explicit.
  const commandsDir = await nestedDir(rootHandle, '.claude', 'commands');
  await writeTextFile(commandsDir, 'vibela.md', commandTemplate);

  // Every other agent/IDE — thin pointer from the registry.
  for (const adapter of AGENT_ADAPTERS) {
    const dir = adapter.segments.length
      ? await nestedDir(rootHandle, ...adapter.segments)
      : rootHandle;
    if (adapter.policy === 'overwrite') {
      await writeTextFile(dir, adapter.filename, (adapter.frontmatter ?? '') + pointerTemplate);
    } else {
      await upsertManagedBlock(dir, adapter.filename, pointerTemplate);
    }
  }
}

/**
 * Create the full .vibela/ scaffold inside rootHandle.
 *
 * Layout:
 *   .vibela/
 *     tasks.json        — initialized as [] only when absent
 *     tasks.md          — initialized with empty header only when absent
 *     stream.jsonl      — initialized as empty file only when absent
 *     screenshots/      — directory created if absent
 *     vibela-workflow.md — always overwritten (single source of truth)
 *   .claude/commands/vibela.md       — Claude slash command (overwrite)
 *   Agent pointers from AGENT_ADAPTERS registry:
 *     .claude/skills/vibela/SKILL.md   — overwrite
 *     .cursor/rules/vibela.mdc         — overwrite
 *     .windsurf/rules/vibela.md        — overwrite
 *     .agent/rules/vibela.md           — overwrite (Google Antigravity)
 *     AGENTS.md                        — managed block (cross-agent standard)
 *     .github/copilot-instructions.md  — managed block (GitHub Copilot)
 */
async function scaffoldVibela(
  rootHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  const vibelaDir = await rootHandle.getDirectoryHandle('.vibela', { create: true });
  await vibelaDir.getDirectoryHandle('screenshots', { create: true });

  // Data files — initialize only when absent.
  await writeTextFileIfAbsent(vibelaDir, 'tasks.json', '[]');
  await writeTextFileIfAbsent(
    vibelaDir,
    'tasks.md',
    '# Vibela Tasks\n\n**Total**: 0 | **To Do**: 0 | **Doing**: 0 | **Done**: 0 | **Failed**: 0\n\n---\n',
  );
  await writeTextFileIfAbsent(vibelaDir, 'stream.jsonl', '');

  // Workflow files — always overwritten.
  await deployWorkflowFiles(rootHandle, vibelaDir);

  return vibelaDir;
}

// ---------------------------------------------------------------------------
// Public API — connect
// ---------------------------------------------------------------------------

/**
 * Invoke the directory picker (MUST be called from a direct user gesture),
 * scaffold .vibela/, and persist the handle in IndexedDB.
 *
 * Throws on unexpected errors; callers should catch:
 *   - AbortError  → user cancelled picker (show no error, return silently)
 *   - NotAllowedError → permission denied
 *   - SecurityError   → insecure context
 */
export async function connect(): Promise<ConnectResult> {
  if (!isSupported()) {
    throw new DOMException(
      'File System Access API or IndexedDB not available in this context',
      'NotSupportedError',
    );
  }

  const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

  await scaffoldVibela(rootHandle);
  await handleStore.save(rootHandle, rootHandle.name);

  return { path: projectName(rootHandle) };
}

// ---------------------------------------------------------------------------
// Public API — restore
// ---------------------------------------------------------------------------

/**
 * Try to restore a previously connected project from IndexedDB without
 * showing the directory picker.
 *
 * Result states:
 *   connected        — handle restored and permission is granted
 *   reconnect        — handle found but permission is not granted (needs gesture)
 *   disconnected     — no handle in IndexedDB (or stale / directory gone)
 */
export async function restore(): Promise<RestoreResult> {
  const stored = await handleStore.load();
  if (!stored) return { state: 'disconnected' };

  const { handle, path } = stored;

  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });

    if (permission === 'granted') {
      // Re-run scaffold to auto-repair workflow files if missing.
      try {
        await scaffoldVibela(handle);
      } catch {
        // Scaffold failure (e.g. dir moved) → fall through to reconnect.
        return { state: 'reconnect', path };
      }
      return { state: 'connected', path };
    }

    // prompt or denied — cannot request permission without a gesture
    return { state: 'reconnect', path };
  } catch {
    // Directory handle is stale or gone.
    await handleStore.clear();
    return { state: 'disconnected' };
  }
}

// ---------------------------------------------------------------------------
// Public API — reconnect
// ---------------------------------------------------------------------------

/**
 * Request permission under a direct user gesture and, on success, re-scaffold.
 * Falls back to connect() when the handle is gone or requestPermission fails
 * with an unrecoverable error.
 *
 * MUST be called from a direct user gesture (click handler).
 */
export async function reconnect(): Promise<ConnectResult> {
  const stored = await handleStore.load();
  if (!stored) {
    // No handle — full picker flow.
    return connect();
  }

  const { handle } = stored;

  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      await scaffoldVibela(handle);
      return { path: projectName(handle) };
    }
    // Permission denied by user.
    throw new DOMException('Access denied.', 'NotAllowedError');
  } catch (err) {
    // If the handle is invalid/stale, fall back to a fresh picker.
    if (err instanceof DOMException && err.name === 'NotAllowedError') throw err;
    await handleStore.clear();
    return connect();
  }
}

// ---------------------------------------------------------------------------
// Public API — disconnect
// ---------------------------------------------------------------------------

/**
 * Clear the stored handle from IndexedDB.
 * Does NOT remove any files from disk.
 */
export async function disconnect(): Promise<void> {
  await handleStore.clear();
}

// ---------------------------------------------------------------------------
// Public API — sync
// ---------------------------------------------------------------------------

/**
 * Read an existing file from a directory handle.
 * Returns null when the file does not exist (NotFoundError).
 */
async function readTextFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
): Promise<string | null> {
  try {
    const fileHandle = await dir.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return null;
    throw err;
  }
}

/**
 * Append lines to a text file using keepExistingData: true + seek to end.
 * Per REQ-2.7: stream.jsonl is append-only, existing content must never be truncated.
 *
 * Falls back to a single retry after 500 ms on lock conflict (REQ-2.7).
 */
async function appendLines(
  dir: FileSystemDirectoryHandle,
  filename: string,
  lines: string[],
): Promise<void> {
  if (lines.length === 0) return;

  const appendContent = lines.join('\n') + '\n';

  const fileHandle = await dir.getFileHandle(filename, { create: true });

  const doAppend = async () => {
    let writable: FileSystemWritableFileStream;
    try {
      writable = await fileHandle.createWritable({ keepExistingData: true });
    } catch {
      writable = await fileHandle.createWritable({ keepExistingData: true });
    }
    // Seek to end so we append rather than overwrite from position 0.
    const file = await fileHandle.getFile();
    await writable.seek(file.size);
    await writable.write(appendContent);
    await writable.close();
  };

  try {
    await doAppend();
  } catch {
    // REQ-2.7: retry once after 500 ms on lock conflict.
    await new Promise<void>((r) => setTimeout(r, 500));
    await doAppend();
  }
}

/**
 * Write a PNG data URL to .vibela/screenshots/<filename>.
 * Screenshots are idempotent by name — existing files are overwritten (REQ-2.6).
 */
async function writeScreenshot(
  screenshotsDir: FileSystemDirectoryHandle,
  filename: string,
  dataUrl: string,
): Promise<void> {
  // Extract the base64 payload after the comma.
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return;
  const base64 = dataUrl.slice(commaIdx + 1);

  // Decode base64 to bytes — prefer Buffer.from in Node.js environments (tests),
  // fall back to atob in browser contexts.
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    // Ensure we produce a Uint8Array backed by a plain ArrayBuffer (not SharedArrayBuffer).
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    bytes = new Uint8Array(ab);
  } else {
    const binary = atob(base64);
    const ab = new ArrayBuffer(binary.length);
    bytes = new Uint8Array(ab);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }

  const fileHandle = await screenshotsDir.getFileHandle(filename, { create: true });
  let writable: FileSystemWritableFileStream;
  try {
    writable = await fileHandle.createWritable({ keepExistingData: false });
  } catch {
    writable = await fileHandle.createWritable();
  }
  await writable.write(bytes);
  await writable.close();
}

/**
 * Write annotations to the connected .vibela/ directory.
 *
 * Steps per spec (REQ-2.3 – REQ-2.8):
 *   1. Read existing tasks.json (empty array if absent).
 *   2. Map annotations to VibelaTask objects.
 *   3. mergeTasks (dedup by stable id, preserve non-"to do" status).
 *   4. Write tasks.json (full overwrite).
 *   5. Write tasks.md (full overwrite).
 *   6. Append new stream.jsonl entries (only the incoming batch, not all tasks).
 *   7. Write screenshot PNGs for annotations that carry one.
 *
 * Returns a SyncResult with the count of tasks written.
 * Returns { count: 0, error: 'not-connected' } when no handle is available.
 */
export async function sync(
  annotations: Annotation[],
  meta?: { pathname?: string },
): Promise<SyncResult> {
  const stored = await handleStore.load();
  if (!stored) {
    return { count: 0, error: 'not-connected' };
  }

  const { handle: rootHandle } = stored;

  // Resolve .vibela/ and screenshots/ handles (must already exist from scaffold).
  const vibelaDir = await rootHandle.getDirectoryHandle('.vibela', { create: false });
  const screenshotsDir = await vibelaDir.getDirectoryHandle('screenshots', { create: true });

  // Read existing tasks.json.
  let existingTasks: VibelaTask[] = [];
  const existingJson = await readTextFile(vibelaDir, 'tasks.json');
  if (existingJson) {
    try {
      existingTasks = JSON.parse(existingJson) as VibelaTask[];
      if (!Array.isArray(existingTasks)) existingTasks = [];
    } catch {
      existingTasks = [];
    }
  }

  // Map annotations to incoming tasks.
  const pathname = meta?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const incomingTasks: VibelaTask[] = annotations.map((a, i) => {
    const task = annotationToTask(a, i);
    // Inject the current pathname (annotationToTask uses window.location.pathname but
    // this call may run in a test context where window is mocked).
    return { ...task, pathname };
  });

  // Merge: dedup by id, preserve non-"to do" statuses.
  const mergedTasks = mergeTasks(existingTasks, incomingTasks);

  // REQ-2.7: full overwrite for tasks.json and tasks.md.
  const writeFileWithRetry = async (filename: string, content: string) => {
    const doWrite = async () => writeTextFile(vibelaDir, filename, content);
    try {
      await doWrite();
    } catch {
      await new Promise<void>((r) => setTimeout(r, 500));
      await doWrite();
    }
  };

  await writeFileWithRetry('tasks.json', JSON.stringify(mergedTasks, null, 2));
  await writeFileWithRetry('tasks.md', tasksToMarkdown(mergedTasks));

  // REQ-2.5: append only the INCOMING batch to stream.jsonl.
  const streamLines = tasksToStreamLines(incomingTasks);
  await appendLines(vibelaDir, 'stream.jsonl', streamLines);

  // REQ-2.6: write screenshots for annotations that carry one.
  for (const a of annotations) {
    if (a.type === 'annotate' && a.screenshot) {
      await writeScreenshot(screenshotsDir, `${a.id}.png`, a.screenshot);
    } else if (a.type === 'text-edit' && a.screenshot) {
      await writeScreenshot(screenshotsDir, `${a.id}.png`, a.screenshot);
    } else if (a.type === 'transform') {
      if (a.screenshotBefore) {
        await writeScreenshot(screenshotsDir, `${a.id}-before.png`, a.screenshotBefore);
      }
      if (a.screenshotAfter) {
        await writeScreenshot(screenshotsDir, `${a.id}-after.png`, a.screenshotAfter);
      }
    }
  }

  return { count: incomingTasks.length, error: null };
}
