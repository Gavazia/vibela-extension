/**
 * ids — shared id validation for annotation file-path safety.
 *
 * Annotation ids derive file paths (.vibela/screenshots/<id>.png), so they must
 * be safe, non-traversal path segments. Validated ONCE upstream so the task list
 * and the screenshot files stay in sync — an annotation dropped here produces
 * neither a task nor a dangling screenshotPath. Ids are crypto.randomUUID() today
 * (with letter-prefixed fallbacks), so this never fires in practice; it is
 * defense-in-depth against a path-traversal sink.
 */
import type { Annotation } from './types';

/**
 * Whether an id is a safe, non-traversal file-path segment.
 *
 * Requires at least one leading alphanumeric so degenerate ids like `-` / `--`
 * are rejected. Accepts crypto.randomUUID() output (starts with a hex digit) and
 * the letter-prefixed fallback ids (annotation-/transform-/swap-/text-edit-).
 */
export const isSafeId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);

/**
 * Keep only annotations whose id is a safe path segment, warning once per
 * dropped id. Validated ONCE so tasks and screenshots derive from the same set —
 * an unsafe id can never yield a task whose screenshotPath points at a file the
 * screenshot loop refused to write.
 */
export function filterSafeAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter((a) => {
    if (isSafeId(a.id)) return true;
    console.warn('[vibela] skipping annotation with unsafe id:', a.id);
    return false;
  });
}
