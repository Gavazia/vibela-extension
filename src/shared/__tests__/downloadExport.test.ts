/**
 * Unit tests for downloadExport.ts (Firefox ZIP fallback).
 *
 * Covers buildVibelaZip — the pure half. triggerZipDownload is a thin DOM
 * side-effect (createObjectURL + <a download>) and is exercised manually.
 *
 * Runs with: npx vitest run
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildVibelaZip } from '../downloadExport';
import type { AnnotateRecord, TransformRecord, VibelaTask } from '../types';

const BASE_ELEMENT_INFO = {
  tag: 'button',
  classes: 'cta-primary',
  text: 'Save',
  label: '',
  parentTag: 'div',
  twClasses: [],
  rawStyles: {
    bg: '#0070f3', color: '#fff', fontSize: '16px', fontWeight: 'bold',
    padding: '8px', borderRadius: '4px', display: 'inline-block', position: 'relative',
  },
  rect: { top: 10, left: 20, width: 100, height: 50 },
};

// Minimal valid 1x1 PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const ANNOTATE: AnnotateRecord = {
  id: 'ann-001',
  type: 'annotate',
  createdAt: 1717600000000,
  elementInfo: BASE_ELEMENT_INFO,
  comment: 'Make this bigger',
  screenshot: PNG_DATA_URL,
  pathname: '/dashboard',
};

const TRANSFORM: TransformRecord = {
  id: 'trn-001',
  type: 'transform',
  createdAt: 1717600002000,
  elementInfo: { ...BASE_ELEMENT_INFO, tag: 'div', classes: 'hero' },
  comment: 'wider',
  transform: { dx: 10, dy: 0, origW: 100, origH: 50, newW: 110, newH: 50 },
  screenshotBefore: PNG_DATA_URL,
  screenshotAfter: PNG_DATA_URL,
  pathname: '/home',
};

describe('buildVibelaZip', () => {
  it('packages the .vibela/ scaffold with tasks, stream, workflow, and screenshots', () => {
    const zip = unzipSync(buildVibelaZip([ANNOTATE, TRANSFORM]).bytes);
    const names = Object.keys(zip);

    expect(names).toContain('.vibela/tasks.json');
    expect(names).toContain('.vibela/tasks.md');
    expect(names).toContain('.vibela/stream.jsonl');
    expect(names).toContain('.vibela/vibela-workflow.md');
    expect(names).toContain('.vibela/screenshots/ann-001.png');
    expect(names).toContain('.vibela/screenshots/trn-001-before.png');
    expect(names).toContain('.vibela/screenshots/trn-001-after.png');
  });

  it('writes a valid tasks.json with one task per annotation', () => {
    const result = buildVibelaZip([ANNOTATE, TRANSFORM]);
    const zip = unzipSync(result.bytes);
    const tasks = JSON.parse(strFromU8(zip['.vibela/tasks.json'])) as VibelaTask[];

    expect(tasks).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(tasks.map((t) => t.id)).toEqual(['ann-001', 'trn-001']);
    expect(tasks[0].status).toBe('to do');
    expect(tasks[0].pathname).toBe('/dashboard');
  });

  it('decodes screenshot PNGs to real bytes (PNG magic header)', () => {
    const zip = unzipSync(buildVibelaZip([ANNOTATE]).bytes);
    const png = zip['.vibela/screenshots/ann-001.png'];
    // PNG signature: 89 50 4E 47
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('handles an empty batch without an empty trailing stream line', () => {
    const result = buildVibelaZip([]);
    const zip = unzipSync(result.bytes);
    expect(result.count).toBe(0);
    expect(strFromU8(zip['.vibela/tasks.json'])).toBe('[]');
    expect(strFromU8(zip['.vibela/stream.jsonl'])).toBe('');
  });
});
