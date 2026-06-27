import type { Annotation, PromptMeta } from './types';

export type PromptAssetKind = 'annotate' | 'text-edit' | 'before' | 'after';

export function typeLabel(type: Annotation['type']): string {
  if (type === 'annotate')   return 'Anotación';
  if (type === 'transform')  return 'Reposición';
  if (type === 'swap')       return 'Intercambio';
  if (type === 'text-edit')  return 'Edición de Texto';
  return type;
}

export function promptAssetFilename(index: number, kind: PromptAssetKind): string {
  return `vibela-${String(index + 1).padStart(2, '0')}-${kind}.png`;
}

function defaultDate(): string {
  return new Date().toLocaleDateString('es-ES', { dateStyle: 'long' });
}

function defaultPathname(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

function defaultViewport(): { w: number; h: number } {
  return typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Synthesizes a concise human-readable description for a single annotation.
 * Used both by buildPrompt (internally) and by vibelaWriter (for comment fallback
 * when the user left no explicit comment on transform/swap annotations).
 */
export function describeAnnotation(a: Annotation, index: number): string {
  const { tag, classes, text, rect } = a.elementInfo;
  const parts: string[] = [];

  if (a.type === 'annotate') {
    parts.push(`Tamaño: ${rect.width}×${rect.height}px`);
    if (a.comment) parts.push(`📝 ${a.comment}`);
  } else if (a.type === 'transform') {
    const { dx, dy, origW, origH, newW, newH } = a.transform;
    parts.push(`Tamaño: ${origW}×${origH}px → ${newW}×${newH}px`);
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
      parts.push(`Mover: ${dx > 0 ? '+' : ''}${Math.round(dx)}px X, ${dy > 0 ? '+' : ''}${Math.round(dy)}px Y`);
    if (a.comment) parts.push(`📝 ${a.comment}`);
  } else if (a.type === 'swap') {
    const tgt = a.targetInfo;
    parts.push(`→ REPOSICIONAR HACIA: <${tgt.tag}>${tgt.text ? ` "${tgt.text.slice(0, 40)}"` : ''}`);
    parts.push(`  Destino tamaño: ${tgt.rect.width}×${tgt.rect.height}px en (${tgt.rect.left}, ${tgt.rect.top})`);
    if (a.comment) parts.push(`📝 ${a.comment}`);
  } else if (a.type === 'text-edit') {
    parts.push(`Texto actual:    "${a.originalText}"`);
    parts.push(`Texto propuesto: "${a.newText}"`);
    if (a.comment) parts.push(`📝 ${a.comment}`);
  }

  // Fallback: synthesize from element info when all else is empty
  if (parts.length === 0) {
    parts.push(`${typeLabel(a.type)}: <${tag}>${classes ? ` .${classes.split(' ')[0]}` : ''}${text ? ` "${text.slice(0, 40)}"` : ''}`);
  }

  return parts.join('\n');
}

export function buildPrompt(annotations: Annotation[], meta: PromptMeta = {}): string {
  const hasScreenshots = annotations.some(
    a => ('screenshot' in a && a.screenshot) || ('screenshotBefore' in a && a.screenshotBefore) || ('screenshotAfter' in a && a.screenshotAfter),
  );
  const viewport = meta.viewport ?? defaultViewport();

  const lines = [
    '== VIBELA PROMPT ==',
    `Fecha: ${meta.date ?? defaultDate()}`,
    `Pantalla: ${meta.pathname ?? defaultPathname()}`,
    `Viewport: ${viewport.w}×${viewport.h}px`,
    '[📸 vibela-00-full-page.png — captura de pantalla completa descargada en Descargas]',
    '',
    '─'.repeat(44),
    'ROL',
    '─'.repeat(44),
    '',
    'Actúa como experto senior en UI/UX, diseño visual, animaciones CSS',
    'y consistencia de interfaces. Tu objetivo es implementar los cambios',
    'visuales descritos más abajo manteniendo la coherencia con el design',
    'system existente (colores, tipografía, spacing, componentes).',
    '',
    '─'.repeat(44),
    'CAMBIOS VISUALES SOLICITADOS',
    '─'.repeat(44),
  ];

  annotations.forEach((a, i) => {
    const { tag, classes, text, label, parentTag, twClasses, rawStyles, rect } = a.elementInfo;
    lines.push('');
    lines.push(`### CAMBIO ${i + 1} — ${typeLabel(a.type)}`);
    if (label) lines.push(`Label:    ${label}`);
    lines.push(`Elemento: <${tag}>${text ? ` "${text.slice(0, 50)}"` : ''}`);
    if (parentTag) lines.push(`Padre:    <${parentTag}>`);
    if (classes) lines.push(`Clases:   ${classes}`);
    if (twClasses?.length) lines.push(`Tailwind: ${twClasses.join(' ')}`);
    if (rawStyles) {
      const styleStr = Object.entries(rawStyles)
        .filter(([, v]) => v && v !== 'rgba(0, 0, 0, 0)' && v !== 'none' && v !== '0px' && v !== 'normal' && v !== 'static')
        .map(([k, v]) => `${k}:${v}`)
        .join(' | ');
      if (styleStr) lines.push(`CSS raw:  ${styleStr}`);
    }

    if (a.type === 'annotate') {
      lines.push(`Tamaño:   ${rect.width}×${rect.height}px`);
      lines.push(`📝 ${a.comment}`);
      if (a.screenshot) lines.push('[📸 ' + promptAssetFilename(i, 'annotate') + ' — descargado en carpeta Descargas]');
    } else if (a.type === 'transform') {
      const { dx, dy, origW, origH, newW, newH } = a.transform;
      lines.push(`Tamaño:   ${origW}×${origH}px → ${newW}×${newH}px`);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
        lines.push(`Mover:    ${dx > 0 ? '+' : ''}${Math.round(dx)}px X, ${dy > 0 ? '+' : ''}${Math.round(dy)}px Y`);
      if (a.comment) lines.push(`📝 ${a.comment}`);
      if (a.screenshotBefore) lines.push('[📸 ' + promptAssetFilename(i, 'before') + ' — ANTES — descargado en carpeta Descargas]');
      if (a.screenshotAfter)  lines.push('[📸 ' + promptAssetFilename(i, 'after') + ' — DESPUÉS — descargado en carpeta Descargas]');
    } else if (a.type === 'swap') {
      const tgt = a.targetInfo;
      lines.push(`→ REPOSICIONAR HACIA: <${tgt.tag}>${tgt.text ? ` "${tgt.text.slice(0, 40)}"` : ''}`);
      lines.push(`  Destino tamaño: ${tgt.rect.width}×${tgt.rect.height}px en (${tgt.rect.left}, ${tgt.rect.top})`);
      if (tgt.twClasses?.length) lines.push(`  Destino Tailwind: ${tgt.twClasses.join(' ')}`);
      if (a.comment) lines.push(`📝 ${a.comment}`);
    } else if (a.type === 'text-edit') {
      lines.push(`Texto actual:    "${a.originalText}"`);
      lines.push(`Texto propuesto: "${a.newText}"`);
      if (a.comment) lines.push(`📝 ${a.comment}`);
      if (a.screenshot) lines.push('[📸 ' + promptAssetFilename(i, 'text-edit') + ' — descargado en carpeta Descargas]');
    }
  });

  lines.push('');
  lines.push('─'.repeat(44));
  lines.push('INSTRUCCIONES');
  lines.push('─'.repeat(44));
  lines.push('');
  lines.push('1. Analiza TODOS los cambios visuales y los screenshots adjuntos.');
  lines.push('2. Identifica los archivos y componentes React exactamente afectados.');
  lines.push('3. Crea un PLAN DE IMPLEMENTACIÓN detallado paso a paso.');
  lines.push('4. Mantén la CONSISTENCIA visual con el design system existente.');
  lines.push('5. Si ves una MEJOR FORMA de lograr el resultado visual, PROPÓNLA.');
  lines.push('6. Haz PREGUNTAS si necesitas más contexto o hay ambigüedad.');
  lines.push('7. ⚠️  NO escribas código todavía. ESPERA mi aprobación explícita.');
  lines.push('   (Responde con "adelante", "go" o "implementa" para proceder.)');
  if (hasScreenshots) {
    lines.push('');
    lines.push('[📎 Screenshots descargados en tu carpeta Descargas — incluí las imágenes vibela-*.png en el chat junto con este prompt]');
  }
  lines.push('');
  lines.push('== FIN VIBELA PROMPT ==');
  return lines.join('\n');
}
