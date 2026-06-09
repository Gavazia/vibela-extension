/**
 * vibelaWriter — pure serialization module (no DOM, no FS, no IndexedDB).
 * Converts Vibela annotations into the .vibela/ file formats:
 *   tasks.json  — structured task array
 *   tasks.md    — human-readable checklist mirror
 *   stream.jsonl — append-only event log
 */
import type {
  Annotation,
  AnnotateRecord,
  TransformRecord,
  SwapRecord,
  TextEditRecord,
  VibelaTask,
  AnnotateDetails,
  TransformDetails,
  SwapDetails,
  TextEditDetails,
} from './types';
import { typeLabel, describeAnnotation } from './promptBuilder';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a best-effort CSS selector from ElementInfo (tag + first class). */
function selectorFromElementInfo(tag: string, classes: string): string {
  const first = classes?.trim().split(/\s+/).filter(Boolean)[0];
  return first ? `${tag}.${first}` : tag;
}

/** Map status string to tasks.md checkbox character. */
function statusCheckbox(status: VibelaTask['status']): string {
  switch (status) {
    case 'to do':   return '[ ]';
    case 'doing':   return '[~]';
    case 'done':    return '[x]';
    case 'failed':  return '[!]';
  }
}

// ---------------------------------------------------------------------------
// annotationToTask
// ---------------------------------------------------------------------------

/**
 * Converts a single Annotation into a VibelaTask.
 * The `index` parameter is only used for the describeAnnotation fallback.
 */
export function annotationToTask(a: Annotation, index: number): VibelaTask {
  const { tag, classes, text, rect } = a.elementInfo;
  const selector = selectorFromElementInfo(tag, classes);
  const timestamp = new Date(a.createdAt).toISOString();
  const comment = a.comment?.trim() || null;

  // Synthesize title: type + element tag + first class + text preview
  const firstClass = classes?.trim().split(/\s+/).filter(Boolean)[0];
  const elementLabel = firstClass ? `${tag}.${firstClass}` : tag;
  const textPreview = text?.slice(0, 30);
  const title = `${typeLabel(a.type)}: ${elementLabel}${textPreview ? ` "${textPreview}"` : ''}`.slice(0, 80);

  const base = {
    id: a.id,
    status: 'to do' as const,
    title,
    // task.comment stores only the user-authored comment (null when absent) per REQ-3.2 / SC-10.
    // describeAnnotation() is available as a synthesis fallback for consumers (e.g. projectSync).
    comment: comment,
    selector,
    boundingRect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    timestamp,
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
  };

  if (a.type === 'annotate') {
    const ar = a as AnnotateRecord;
    const details: AnnotateDetails = {};
    return {
      ...base,
      type: 'annotate',
      screenshotPath: ar.screenshot ? `./screenshots/${a.id}.png` : null,
      details,
    };
  }

  if (a.type === 'transform') {
    const tr = a as TransformRecord;
    const details: TransformDetails = {
      dx: tr.transform.dx,
      dy: tr.transform.dy,
      origW: tr.transform.origW,
      origH: tr.transform.origH,
      newW: tr.transform.newW,
      newH: tr.transform.newH,
      screenshotBefore: tr.screenshotBefore ? `./screenshots/${a.id}-before.png` : null,
      screenshotAfter: tr.screenshotAfter ? `./screenshots/${a.id}-after.png` : null,
    };
    return {
      ...base,
      type: 'transform',
      // Per REQ-4.2: screenshotPath is null for transform tasks
      screenshotPath: null,
      screenshotPaths: {
        before: tr.screenshotBefore ? `./screenshots/${a.id}-before.png` : undefined,
        after: tr.screenshotAfter ? `./screenshots/${a.id}-after.png` : undefined,
      },
      details,
    };
  }

  if (a.type === 'swap') {
    const sr = a as SwapRecord;
    const tgt = sr.targetInfo;
    const details: SwapDetails = {
      targetSelector: selectorFromElementInfo(tgt.tag, tgt.classes),
      targetBoundingRect: {
        top: tgt.rect.top,
        left: tgt.rect.left,
        width: tgt.rect.width,
        height: tgt.rect.height,
      },
      targetText: tgt.text?.trim() || null,
    };
    return {
      ...base,
      type: 'swap',
      // Per REQ-4.3: no screenshot for swap
      screenshotPath: null,
      details,
    };
  }

  // text-edit
  const ter = a as TextEditRecord;
  const details: TextEditDetails = {
    originalText: ter.originalText,
    newText: ter.newText,
  };
  return {
    ...base,
    type: 'text-edit',
    screenshotPath: ter.screenshot ? `./screenshots/${a.id}.png` : null,
    details,
  };
}

// ---------------------------------------------------------------------------
// tasksToMarkdown  (REQ-5)
// ---------------------------------------------------------------------------

export function tasksToMarkdown(tasks: VibelaTask[]): string {
  const total   = tasks.length;
  const todo    = tasks.filter(t => t.status === 'to do').length;
  const doing   = tasks.filter(t => t.status === 'doing').length;
  const done    = tasks.filter(t => t.status === 'done').length;
  const failed  = tasks.filter(t => t.status === 'failed').length;

  const lines: string[] = [
    '# Vibela Tasks',
    '',
    `**Total**: ${total} | **To Do**: ${todo} | **Doing**: ${doing} | **Done**: ${done} | **Failed**: ${failed}`,
    '',
    '---',
    '',
  ];

  for (const task of tasks) {
    const cb = statusCheckbox(task.status);
    lines.push(`- ${cb} **${task.title}** \`${task.selector}\``);
    if (task.comment) {
      lines.push(`  > ${task.comment}`);
    }
    lines.push(`  > Type: ${task.type} | ID: ${task.id}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// tasksToStreamLines  (REQ-2.5)
// ---------------------------------------------------------------------------

export function tasksToStreamLines(
  tasks: VibelaTask[],
  event: string = 'sync',
): string[] {
  return tasks.map(t =>
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      taskId: t.id,
      type: t.type,
    }),
  );
}

// ---------------------------------------------------------------------------
// mergeTasks  (REQ-2.3)
// ---------------------------------------------------------------------------

/**
 * Merges incoming tasks into the existing array.
 * Dedup key: stable `id` field (REQ-2.3, spec is authoritative).
 *
 * Rules:
 * - If an existing task with the same id has a non-"to do" status, preserve it.
 * - Update all other fields from the incoming task.
 * - Append truly new tasks (no matching id) with status "to do".
 */
export function mergeTasks(
  existing: VibelaTask[],
  incoming: VibelaTask[],
): VibelaTask[] {
  const byId = new Map<string, VibelaTask>(existing.map(t => [t.id, t]));

  for (const inTask of incoming) {
    const prev = byId.get(inTask.id);
    if (prev) {
      // Preserve non-"to do" status; update everything else
      byId.set(inTask.id, {
        ...inTask,
        status: prev.status !== 'to do' ? prev.status : 'to do',
      });
    } else {
      byId.set(inTask.id, { ...inTask, status: 'to do' });
    }
  }

  // Preserve original order for existing entries, then append new ones
  const result: VibelaTask[] = [];
  const seen = new Set<string>();

  for (const t of existing) {
    const merged = byId.get(t.id);
    if (merged) {
      result.push(merged);
      seen.add(t.id);
    }
  }
  for (const t of incoming) {
    if (!seen.has(t.id)) {
      result.push(byId.get(t.id)!);
      seen.add(t.id);
    }
  }

  return result;
}
