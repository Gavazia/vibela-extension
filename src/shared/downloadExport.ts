/**
 * downloadExport — ZIP fallback for browsers without the File System Access API
 * (Firefox, primarily). Chrome uses projectSync to write .vibela/ straight to a
 * chosen directory; Firefox cannot, so here we package the exact same .vibela/
 * payload into a single ZIP the user unzips at their repo root.
 *
 * Split in two:
 *   buildVibelaZip()    — PURE: annotations → ZIP bytes (no DOM, testable).
 *   triggerZipDownload() — side-effect: hand the bytes to the browser download UI.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  annotationToTask,
  tasksToMarkdown,
  tasksToStreamLines,
} from './vibelaWriter';
import type { Annotation, VibelaTask } from './types';
import { filterSafeAnnotations } from './ids';

// Single source of truth for the agent workflow — same template projectSync
// writes to .vibela/vibela-workflow.md so the ZIP is self-sufficient.
import workflowTemplate from '../workflow-templates/vibela-workflow.md?raw';

/** Decode a `data:image/png;base64,...` URL into raw PNG bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const base64 = dataUrl.slice(commaIdx + 1);

  // Buffer in Node (vitest); atob in the browser content-script context.
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Build a ZIP mirroring the .vibela/ scaffold from a batch of annotations.
 *
 * Layout inside the archive:
 *   .vibela/tasks.json
 *   .vibela/tasks.md
 *   .vibela/stream.jsonl
 *   .vibela/vibela-workflow.md
 *   .vibela/screenshots/<id>.png            (annotate / text-edit / swap)
 *   .vibela/screenshots/<id>-before.png     (transform)
 *   .vibela/screenshots/<id>-after.png      (transform)
 *
 * No merge step: this is a fresh export, not an incremental sync, so every
 * annotation becomes a "to do" task.
 *
 * Returns the ZIP bytes alongside the count of annotations actually exported
 * (after unsafe-id filtering), so callers report a truthful number.
 */
export function buildVibelaZip(
  annotations: Annotation[],
  meta?: { pathname?: string },
): { bytes: Uint8Array; count: number } {
  const fallbackPathname =
    meta?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');

  // Validate ids ONCE here so tasks and screenshots derive from the same set —
  // an unsafe id can never yield a task whose screenshotPath points at a file the
  // screenshot loop refused to write.
  const safeAnnotations = filterSafeAnnotations(annotations);

  const tasks: VibelaTask[] = safeAnnotations.map((a, i) => {
    const task = annotationToTask(a, i);
    return a.pathname ? task : { ...task, pathname: fallbackPathname };
  });

  // PNGs are already DEFLATE-incompressible; storing them with level 0 (no
  // re-deflate) avoids wasted main-thread CPU for ~zero size benefit. Text
  // entries keep the default deflate.
  const files: Zippable = {
    '.vibela/tasks.json': strToU8(JSON.stringify(tasks, null, 2)),
    '.vibela/tasks.md': strToU8(tasksToMarkdown(tasks)),
    '.vibela/stream.jsonl': strToU8(tasksToStreamLines(tasks, 'export').join('\n') + (tasks.length ? '\n' : '')),
    '.vibela/vibela-workflow.md': strToU8(workflowTemplate),
  };

  for (const a of safeAnnotations) {
    if ((a.type === 'annotate' || a.type === 'text-edit' || a.type === 'swap') && a.screenshot) {
      const bytes = dataUrlToBytes(a.screenshot);
      if (bytes) files[`.vibela/screenshots/${a.id}.png`] = [bytes, { level: 0 }];
    } else if (a.type === 'transform') {
      if (a.screenshotBefore) {
        const bytes = dataUrlToBytes(a.screenshotBefore);
        if (bytes) files[`.vibela/screenshots/${a.id}-before.png`] = [bytes, { level: 0 }];
      }
      if (a.screenshotAfter) {
        const bytes = dataUrlToBytes(a.screenshotAfter);
        if (bytes) files[`.vibela/screenshots/${a.id}-after.png`] = [bytes, { level: 0 }];
      }
    }
  }

  return { bytes: zipSync(files), count: safeAnnotations.length };
}

/**
 * Hand ZIP bytes to the browser's download UI via a transient blob URL.
 * Runs in the content-script context (the page's DOM), so no chrome.downloads
 * permission and no background round-trip are needed — keeps the Firefox path
 * self-contained and avoids data-URL size limits.
 */
export function triggerZipDownload(bytes: Uint8Array, filename: string): void {
  // Pass the bytes straight to the Blob ctor — no copy. The cast satisfies the
  // BlobPart type (fflate returns Uint8Array<ArrayBufferLike>).
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
