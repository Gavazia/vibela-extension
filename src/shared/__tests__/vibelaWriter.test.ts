/**
 * Unit tests for vibelaWriter.ts and describeAnnotation from promptBuilder.ts
 *
 * Covers: T-04 (ADR-8, SC-5, SC-6, SC-9, SC-10)
 *
 * Runs with: npx vitest run  (or npm run test:unit)
 */
import { describe, it, expect } from 'vitest';
import {
  annotationToTask,
  tasksToMarkdown,
  tasksToStreamLines,
  mergeTasks,
} from '../vibelaWriter';
import { describeAnnotation } from '../promptBuilder';
import type {
  AnnotateRecord,
  TransformRecord,
  SwapRecord,
  TextEditRecord,
  VibelaTask,
} from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_RECT = { top: 10, left: 20, width: 100, height: 50 };
const BASE_ELEMENT_INFO = {
  tag: 'button',
  classes: 'cta-primary secondary',
  text: 'Save',
  label: '',
  parentTag: 'div',
  twClasses: ['bg-blue-500'],
  rawStyles: {
    bg: '#0070f3',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '8px 16px',
    borderRadius: '4px',
    display: 'inline-block',
    position: 'relative',
  },
  rect: BASE_RECT,
};

const ANNOTATE_WITH_SCREENSHOT: AnnotateRecord = {
  id: 'ann-001',
  type: 'annotate',
  createdAt: 1717600000000,
  elementInfo: BASE_ELEMENT_INFO,
  comment: 'Make this button bigger',
  screenshot: 'data:image/png;base64,abc123',
};

const ANNOTATE_NO_COMMENT: AnnotateRecord = {
  id: 'ann-002',
  type: 'annotate',
  createdAt: 1717600001000,
  elementInfo: BASE_ELEMENT_INFO,
  // no comment
};

const TRANSFORM_WITH_SCREENSHOTS: TransformRecord = {
  id: 'trn-001',
  type: 'transform',
  createdAt: 1717600002000,
  elementInfo: { ...BASE_ELEMENT_INFO, tag: 'div', classes: 'hero' },
  comment: 'make wider',
  transform: {
    dx: 10,
    dy: 0,
    origW: 100,
    origH: 50,
    newW: 120,
    newH: 50,
  },
  screenshotBefore: 'data:image/png;base64,before',
  screenshotAfter: 'data:image/png;base64,after',
};

const SWAP_NO_COMMENT: SwapRecord = {
  id: 'swp-001',
  type: 'swap',
  createdAt: 1717600003000,
  elementInfo: { ...BASE_ELEMENT_INFO, tag: 'section', classes: 'footer-section' },
  targetInfo: {
    tag: 'header',
    classes: 'main-header',
    text: 'Welcome',
    label: '',
    parentTag: 'body',
    twClasses: [],
    rawStyles: {
      bg: '',
      color: '',
      fontSize: '',
      fontWeight: '',
      padding: '',
      borderRadius: '',
      display: '',
      position: '',
    },
    rect: { top: 0, left: 0, width: 1440, height: 80 },
  },
  // no comment
};

const TEXT_EDIT_WITH_SCREENSHOT: TextEditRecord = {
  id: 'txt-001',
  type: 'text-edit',
  createdAt: 1717600004000,
  elementInfo: { ...BASE_ELEMENT_INFO, tag: 'h1', classes: 'hero-title' },
  comment: 'fix typo',
  originalText: 'Welcme',
  newText: 'Welcome',
  screenshot: 'data:image/png;base64,txtshot',
};

// ---------------------------------------------------------------------------
// describeAnnotation — T-04 / ADR-6
// ---------------------------------------------------------------------------

describe('describeAnnotation', () => {
  it('returns non-empty string for annotate type', () => {
    const out = describeAnnotation(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for transform type', () => {
    const out = describeAnnotation(TRANSFORM_WITH_SCREENSHOTS, 1);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('100');
    expect(out).toContain('120');
  });

  it('returns non-empty string for swap type', () => {
    const out = describeAnnotation(SWAP_NO_COMMENT, 2);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('header');
  });

  it('returns non-empty string for text-edit type', () => {
    const out = describeAnnotation(TEXT_EDIT_WITH_SCREENSHOT, 3);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Welcme');
    expect(out).toContain('Welcome');
  });
});

// ---------------------------------------------------------------------------
// annotationToTask — common fields
// ---------------------------------------------------------------------------

describe('annotationToTask — common fields', () => {
  it('preserves annotation id unchanged', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.id).toBe('ann-001');
  });

  it('sets status to "to do" for all new tasks', () => {
    const tasks = [
      annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0),
      annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1),
      annotationToTask(SWAP_NO_COMMENT, 2),
      annotationToTask(TEXT_EDIT_WITH_SCREENSHOT, 3),
    ];
    for (const t of tasks) {
      expect(t.status).toBe('to do');
    }
  });

  it('converts createdAt millis to ISO 8601 timestamp string', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.timestamp).toBe(new Date(1717600000000).toISOString());
  });

  it('synthesizes selector as tag.first-class', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.selector).toBe('button.cta-primary');
  });

  it('copies boundingRect with top/left/width/height', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.boundingRect).toEqual({ top: 10, left: 20, width: 100, height: 50 });
  });

  it('title is at most 80 characters', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.title.length).toBeLessThanOrEqual(80);
  });

  it('comment is null when user left no comment (SC-10)', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    expect(task.comment).toBeNull();
  });

  it('comment stores user-authored text when present', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.comment).toBe('Make this button bigger');
  });
});

// ---------------------------------------------------------------------------
// annotationToTask — annotate type (REQ-4.1)
// ---------------------------------------------------------------------------

describe('annotationToTask — annotate', () => {
  it('type is "annotate"', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.type).toBe('annotate');
  });

  it('screenshotPath set when screenshot present', () => {
    const task = annotationToTask(ANNOTATE_WITH_SCREENSHOT, 0);
    expect(task.screenshotPath).toBe('./screenshots/ann-001.png');
  });

  it('screenshotPath is null when no screenshot', () => {
    const task = annotationToTask(ANNOTATE_NO_COMMENT, 1);
    expect(task.screenshotPath).toBeNull();
  });

  it('title synthesized when comment absent (REQ-3.4)', () => {
    const task = annotationToTask(ANNOTATE_NO_COMMENT, 1);
    expect(task.title).toContain('button');
    expect(task.comment).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// annotationToTask — transform type (REQ-4.2, SC-9)
// ---------------------------------------------------------------------------

describe('annotationToTask — transform', () => {
  it('type is "transform"', () => {
    const task = annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1);
    expect(task.type).toBe('transform');
  });

  it('screenshotPath is null for transform (REQ-4.2)', () => {
    const task = annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1);
    expect(task.screenshotPath).toBeNull();
  });

  it('details contains all transform fields (SC-9)', () => {
    const task = annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1);
    const details = task.details as import('../types').TransformDetails;
    expect(details.dx).toBe(10);
    expect(details.dy).toBe(0);
    expect(details.origW).toBe(100);
    expect(details.origH).toBe(50);
    expect(details.newW).toBe(120);
    expect(details.newH).toBe(50);
  });

  it('details.screenshotBefore and screenshotAfter set correctly (SC-9)', () => {
    const task = annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1);
    const details = task.details as import('../types').TransformDetails;
    expect(details.screenshotBefore).toBe('./screenshots/trn-001-before.png');
    expect(details.screenshotAfter).toBe('./screenshots/trn-001-after.png');
  });

  it('screenshotPaths mirrors details paths', () => {
    const task = annotationToTask(TRANSFORM_WITH_SCREENSHOTS, 1);
    expect(task.screenshotPaths?.before).toBe('./screenshots/trn-001-before.png');
    expect(task.screenshotPaths?.after).toBe('./screenshots/trn-001-after.png');
  });
});

// ---------------------------------------------------------------------------
// annotationToTask — swap type (REQ-4.3, SC-10)
// ---------------------------------------------------------------------------

describe('annotationToTask — swap', () => {
  it('type is "swap"', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    expect(task.type).toBe('swap');
  });

  it('screenshotPath is null for swap (REQ-4.3)', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    expect(task.screenshotPath).toBeNull();
  });

  it('comment is null when no user comment (SC-10)', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    expect(task.comment).toBeNull();
  });

  it('title synthesized from type and element (SC-10)', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    expect(task.title).toContain('section');
    expect(task.title.length).toBeGreaterThan(0);
    expect(task.title.length).toBeLessThanOrEqual(80);
  });

  it('details.targetSelector synthesized from targetInfo', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    const details = task.details as import('../types').SwapDetails;
    expect(details.targetSelector).toBe('header.main-header');
  });

  it('details.targetBoundingRect uses top/left/width/height', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    const details = task.details as import('../types').SwapDetails;
    expect(details.targetBoundingRect).toEqual({ top: 0, left: 0, width: 1440, height: 80 });
  });

  it('details.targetText set from targetInfo.text', () => {
    const task = annotationToTask(SWAP_NO_COMMENT, 2);
    const details = task.details as import('../types').SwapDetails;
    expect(details.targetText).toBe('Welcome');
  });
});

// ---------------------------------------------------------------------------
// annotationToTask — text-edit type (REQ-4.4)
// ---------------------------------------------------------------------------

describe('annotationToTask — text-edit', () => {
  it('type is "text-edit"', () => {
    const task = annotationToTask(TEXT_EDIT_WITH_SCREENSHOT, 3);
    expect(task.type).toBe('text-edit');
  });

  it('screenshotPath set when screenshot present (REQ-4.4)', () => {
    const task = annotationToTask(TEXT_EDIT_WITH_SCREENSHOT, 3);
    expect(task.screenshotPath).toBe('./screenshots/txt-001.png');
  });

  it('details contains originalText and newText', () => {
    const task = annotationToTask(TEXT_EDIT_WITH_SCREENSHOT, 3);
    const details = task.details as import('../types').TextEditDetails;
    expect(details.originalText).toBe('Welcme');
    expect(details.newText).toBe('Welcome');
  });
});

// ---------------------------------------------------------------------------
// tasksToMarkdown (REQ-5)
// ---------------------------------------------------------------------------

const SAMPLE_TASKS: VibelaTask[] = [
  {
    id: 'task-1',
    type: 'annotate',
    status: 'to do',
    title: 'Anotación: button.cta',
    comment: 'Fix the button',
    selector: 'button.cta',
    boundingRect: { top: 0, left: 0, width: 100, height: 40 },
    screenshotPath: './screenshots/task-1.png',
    timestamp: new Date(1717600000000).toISOString(),
    pathname: '/home',
    details: {},
  },
  {
    id: 'task-2',
    type: 'transform',
    status: 'doing',
    title: 'Reposición: div.hero',
    comment: null,
    selector: 'div.hero',
    boundingRect: { top: 0, left: 0, width: 200, height: 100 },
    screenshotPath: null,
    timestamp: new Date(1717600001000).toISOString(),
    pathname: '/home',
    details: {
      dx: 5,
      dy: 0,
      origW: 200,
      origH: 100,
      newW: 210,
      newH: 100,
      screenshotBefore: null,
      screenshotAfter: null,
    },
  },
  {
    id: 'task-3',
    type: 'swap',
    status: 'done',
    title: 'Intercambio: section.footer',
    comment: null,
    selector: 'section.footer',
    boundingRect: { top: 0, left: 0, width: 1440, height: 120 },
    screenshotPath: null,
    timestamp: new Date(1717600002000).toISOString(),
    pathname: '/home',
    details: {
      targetSelector: 'header.main',
      targetBoundingRect: { top: 0, left: 0, width: 1440, height: 80 },
      targetText: null,
    },
  },
  {
    id: 'task-4',
    type: 'text-edit',
    status: 'failed',
    title: 'Edición de Texto: h1.hero-title',
    comment: 'fix typo',
    selector: 'h1.hero-title',
    boundingRect: { top: 0, left: 0, width: 800, height: 60 },
    screenshotPath: './screenshots/task-4.png',
    timestamp: new Date(1717600003000).toISOString(),
    pathname: '/home',
    details: { originalText: 'Welcme', newText: 'Welcome' },
  },
];

describe('tasksToMarkdown', () => {
  it('header contains correct stats', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    expect(md).toContain('**Total**: 4');
    expect(md).toContain('**To Do**: 1');
    expect(md).toContain('**Doing**: 1');
    expect(md).toContain('**Done**: 1');
    expect(md).toContain('**Failed**: 1');
  });

  it('uses correct checkbox per status', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    expect(md).toContain('- [ ]');
    expect(md).toContain('- [~]');
    expect(md).toContain('- [x]');
    expect(md).toContain('- [!]');
  });

  it('null comment is omitted (no blockquote line for it)', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    // task-2 has null comment; its entry should have no comment blockquote
    const lines = md.split('\n');
    const task2Line = lines.findIndex(l => l.includes('div.hero'));
    expect(task2Line).toBeGreaterThanOrEqual(0);
    // Next line(s) should jump to Type/ID line, not a comment
    const nextMeaningfulLine = lines.slice(task2Line + 1).find(l => l.trim().length > 0);
    expect(nextMeaningfulLine).toContain('Type: transform');
  });

  it('non-null comment appears as blockquote', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    expect(md).toContain('  > Fix the button');
  });

  it('task ordering matches input array order', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    const pos1 = md.indexOf('task-1');
    const pos2 = md.indexOf('task-2');
    const pos3 = md.indexOf('task-3');
    const pos4 = md.indexOf('task-4');
    expect(pos1).toBeLessThan(pos2);
    expect(pos2).toBeLessThan(pos3);
    expect(pos3).toBeLessThan(pos4);
  });

  it('returns header + "---" divider', () => {
    const md = tasksToMarkdown(SAMPLE_TASKS);
    expect(md).toContain('# Vibela Tasks');
    expect(md).toContain('---');
  });

  it('empty task array produces header with all zeros', () => {
    const md = tasksToMarkdown([]);
    expect(md).toContain('**Total**: 0');
    expect(md).toContain('**To Do**: 0');
  });
});

// ---------------------------------------------------------------------------
// tasksToStreamLines (REQ-2.5)
// ---------------------------------------------------------------------------

describe('tasksToStreamLines', () => {
  it('returns one line per task', () => {
    const lines = tasksToStreamLines(SAMPLE_TASKS);
    expect(lines.length).toBe(4);
  });

  it('each line is valid JSON with required fields', () => {
    const lines = tasksToStreamLines(SAMPLE_TASKS);
    for (const line of lines) {
      const obj = JSON.parse(line);
      expect(typeof obj.ts).toBe('string');
      expect(obj.event).toBe('sync');
      expect(typeof obj.taskId).toBe('string');
      expect(typeof obj.type).toBe('string');
    }
  });

  it('uses custom event name when provided', () => {
    const lines = tasksToStreamLines(SAMPLE_TASKS.slice(0, 1), 'resync');
    const obj = JSON.parse(lines[0]);
    expect(obj.event).toBe('resync');
  });
});

// ---------------------------------------------------------------------------
// mergeTasks (REQ-2.3, SC-6)
// ---------------------------------------------------------------------------

describe('mergeTasks', () => {
  const existing: VibelaTask[] = [
    {
      id: 'abc',
      type: 'annotate',
      status: 'done',
      title: 'Old title',
      comment: 'old comment',
      selector: 'button',
      boundingRect: { top: 0, left: 0, width: 100, height: 40 },
      screenshotPath: null,
      timestamp: new Date(1000).toISOString(),
      pathname: '/old',
      details: {},
    },
    {
      id: 'xyz',
      type: 'swap',
      status: 'to do',
      title: 'Swap xyz',
      comment: null,
      selector: 'div',
      boundingRect: { top: 0, left: 0, width: 200, height: 80 },
      screenshotPath: null,
      timestamp: new Date(2000).toISOString(),
      pathname: '/old',
      details: {
        targetSelector: 'header',
        targetBoundingRect: { top: 0, left: 0, width: 1440, height: 80 },
        targetText: null,
      },
    },
  ];

  const incoming: VibelaTask[] = [
    {
      id: 'abc',
      type: 'annotate',
      status: 'to do',
      title: 'New title for abc',
      comment: 'new comment',
      selector: 'button.updated',
      boundingRect: { top: 5, left: 5, width: 110, height: 45 },
      screenshotPath: './screenshots/abc.png',
      timestamp: new Date(9000).toISOString(),
      pathname: '/new',
      details: {},
    },
    {
      id: 'new-one',
      type: 'text-edit',
      status: 'to do',
      title: 'New task',
      comment: null,
      selector: 'h1',
      boundingRect: { top: 0, left: 0, width: 800, height: 60 },
      screenshotPath: null,
      timestamp: new Date(9001).toISOString(),
      pathname: '/new',
      details: { originalText: 'old', newText: 'new' },
    },
  ];

  it('preserves "done" status on merge (SC-6)', () => {
    const merged = mergeTasks(existing, incoming);
    const abc = merged.find(t => t.id === 'abc');
    expect(abc?.status).toBe('done');
  });

  it('updates other fields from incoming when merging', () => {
    const merged = mergeTasks(existing, incoming);
    const abc = merged.find(t => t.id === 'abc');
    expect(abc?.title).toBe('New title for abc');
    expect(abc?.selector).toBe('button.updated');
    expect(abc?.screenshotPath).toBe('./screenshots/abc.png');
  });

  it('appends new entries not in existing', () => {
    const merged = mergeTasks(existing, incoming);
    const newOne = merged.find(t => t.id === 'new-one');
    expect(newOne).toBeDefined();
    expect(newOne?.status).toBe('to do');
  });

  it('no duplicate entries created (SC-6)', () => {
    const merged = mergeTasks(existing, incoming);
    const abcEntries = merged.filter(t => t.id === 'abc');
    expect(abcEntries.length).toBe(1);
  });

  it('existing entries not in incoming remain unchanged', () => {
    const merged = mergeTasks(existing, incoming);
    const xyz = merged.find(t => t.id === 'xyz');
    expect(xyz).toBeDefined();
    expect(xyz?.status).toBe('to do');
  });

  it('result contains all ids: existing + new', () => {
    const merged = mergeTasks(existing, incoming);
    const ids = merged.map(t => t.id);
    expect(ids).toContain('abc');
    expect(ids).toContain('xyz');
    expect(ids).toContain('new-one');
    expect(ids.length).toBe(3);
  });

  it('preserves "failed" status on merge', () => {
    const existingFailed: VibelaTask[] = [
      { ...existing[0], id: 'fail-1', status: 'failed' },
    ];
    const incomingUpdate: VibelaTask[] = [
      { ...incoming[0], id: 'fail-1', status: 'to do' },
    ];
    const merged = mergeTasks(existingFailed, incomingUpdate);
    expect(merged[0].status).toBe('failed');
  });

  it('preserves "doing" status on merge', () => {
    const existingDoing: VibelaTask[] = [
      { ...existing[0], id: 'doing-1', status: 'doing' },
    ];
    const incomingUpdate: VibelaTask[] = [
      { ...incoming[0], id: 'doing-1', status: 'to do' },
    ];
    const merged = mergeTasks(existingDoing, incomingUpdate);
    expect(merged[0].status).toBe('doing');
  });

  it('merge with empty existing returns all incoming as "to do"', () => {
    const merged = mergeTasks([], incoming);
    expect(merged.length).toBe(incoming.length);
    for (const t of merged) expect(t.status).toBe('to do');
  });

  it('merge with empty incoming returns existing unchanged', () => {
    const merged = mergeTasks(existing, []);
    expect(merged.length).toBe(existing.length);
    expect(merged[0].id).toBe('abc');
  });
});
