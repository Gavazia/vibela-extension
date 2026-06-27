import { buildPrompt } from '../src/shared/promptBuilder.ts';
import type { Annotation } from '../src/shared/types.ts';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Reproduce the exact annotation shape used in the original golden fixture
const annotations: Annotation[] = [
  {
    type: 'annotate',
    comment: 'Aumentar contraste del CTA.',
    screenshot: 'data:image/png;base64,stub',
    elementInfo: {
      tag: 'button', text: 'Start review', label: 'Light fixture card',
      parentTag: 'section', classes: 'cta primary-action',
      twClasses: ['bg-indigo-600','text-white','text-base','font-semibold','py-3','px-6','rounded-full'],
      rawStyles: { bg: 'rgb(79, 70, 229)', color: 'rgb(255, 255, 255)', fontSize: '16px', fontWeight: '600', padding: '12px 24px 12px 24px', borderRadius: '9999px', display: 'inline-block' },
      rect: { x: 100, y: 200, width: 140, height: 44, left: 100, top: 200, right: 240, bottom: 244 }
    }
  },
  {
    type: 'transform',
    comment: 'Subir ligeramente y hacerlo más ancho.',
    transform: { dx: 12, dy: -8, origW: 140, origH: 44, newW: 180, newH: 48 },
    screenshotBefore: 'data:image/png;base64,stub',
    screenshotAfter: 'data:image/png;base64,stub',
    elementInfo: {
      tag: 'button', text: 'Start review', label: 'Light fixture card',
      parentTag: 'section', classes: 'cta primary-action',
      twClasses: ['bg-indigo-600','text-white','text-base','font-semibold','py-3','px-6','rounded-full'],
      rawStyles: { bg: 'rgb(79, 70, 229)', color: 'rgb(255, 255, 255)', fontSize: '16px', fontWeight: '600', padding: '12px 24px 12px 24px', borderRadius: '9999px', display: 'inline-block' },
      rect: { x: 100, y: 200, width: 140, height: 44, left: 100, top: 200, right: 240, bottom: 244 }
    }
  },
  {
    type: 'swap',
    comment: 'Mover el CTA junto al chip de destino.',
    elementInfo: {
      tag: 'button', text: 'Start review', label: 'Light fixture card',
      parentTag: 'section', classes: 'cta primary-action',
      twClasses: ['bg-indigo-600','text-white','text-base','font-semibold','py-3','px-6','rounded-full'],
      rawStyles: { bg: 'rgb(79, 70, 229)', color: 'rgb(255, 255, 255)', fontSize: '16px', fontWeight: '600', padding: '12px 24px 12px 24px', borderRadius: '9999px', display: 'inline-block' },
      rect: { x: 100, y: 200, width: 140, height: 44, left: 100, top: 200, right: 240, bottom: 244 }
    },
    targetInfo: {
      tag: 'button', text: 'Destination chip',
      twClasses: ['bg-emerald-500','text-white','rounded-full'],
      rect: { x: 520, y: 260, width: 150, height: 40, left: 520, top: 260, right: 670, bottom: 300 }
    }
  },
  {
    type: 'text-edit',
    originalText: 'Start review',
    newText: 'Revisar diseño',
    comment: 'Usar texto en español.',
    screenshot: 'data:image/png;base64,stub',
    elementInfo: {
      tag: 'button', text: 'Start review', label: 'Light fixture card',
      parentTag: 'section', classes: 'cta primary-action',
      twClasses: ['bg-indigo-600','text-white','text-base','font-semibold','py-3','px-6','rounded-full'],
      rawStyles: { bg: 'rgb(79, 70, 229)', color: 'rgb(255, 255, 255)', fontSize: '16px', fontWeight: '600', padding: '12px 24px 12px 24px', borderRadius: '9999px', display: 'inline-block' },
      rect: { x: 100, y: 200, width: 140, height: 44, left: 100, top: 200, right: 240, bottom: 244 }
    }
  }
];

const result = buildPrompt(annotations, {
  date: '1 de enero de 2026',
  pathname: '/fixtures/light.html',
  viewport: { w: 1280, h: 720 }
});

const outPath = join(__dirname, '..', 'fixtures', 'prompts', 'mixed.golden.txt');
writeFileSync(outPath, result, 'utf-8');
console.log('Golden written to:', outPath);
console.log('Content:\n', result);
