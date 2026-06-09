import { getElInfo, isEligibleElement, isOwnUi } from './dom';
import type { ElementInfo } from './types';

export type PickerMode =
  | 'idle'
  | 'annotate'
  | 'transform.select'
  | 'transform.dragging'
  | 'transform.resizing'
  | 'transform.saveForm'
  | 'swap.first'
  | 'swap.second'
  | 'swap.popup'
  | 'text-edit'
  | 'text-edit.popup';

export interface PickerSnapshot {
  el: HTMLElement;
  info: ElementInfo;
}

export interface PickerEngineOptions {
  shadowHostEl: HTMLElement;
  onHover: (snapshot: PickerSnapshot | null) => void;
  onSelect: (snapshot: PickerSnapshot) => void;
}

export interface PickerEngine {
  setActive(active: boolean): void;
  setMode(mode: PickerMode): void;
  dispose(): void;
}

function targetAtEvent(event: MouseEvent, shadowHostEl: HTMLElement): HTMLElement | null {
  if (isOwnUi(event, shadowHostEl)) return null;
  const atPoint = document.elementFromPoint(event.clientX, event.clientY);
  const target = atPoint instanceof HTMLElement ? atPoint : event.target;
  return target instanceof HTMLElement ? target : null;
}

function snapshotFor(target: HTMLElement | null): PickerSnapshot | null {
  if (!isEligibleElement(target)) return null;
  const info = getElInfo(target);
  return info ? { el: target, info } : null;
}

export function createPickerEngine(options: PickerEngineOptions): PickerEngine {
  let active = false;
  let mode: PickerMode = 'idle';
  let hoverEl: HTMLElement | null = null;
  let raf = 0;

  const clearHover = () => {
    hoverEl = null;
    options.onHover(null);
  };

  const emitHover = (event: MouseEvent) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!active || mode === 'idle' || mode === 'transform.dragging' || mode === 'transform.resizing' || mode === 'transform.saveForm') return clearHover();
      const snapshot = snapshotFor(targetAtEvent(event, options.shadowHostEl));
      if (!snapshot) return clearHover();
      if (snapshot.el !== hoverEl) hoverEl = snapshot.el;
      options.onHover(snapshot);
    });
  };

  const onMouseMove = (event: MouseEvent) => emitHover(event);

  const onClick = (event: MouseEvent) => {
    if (!active || mode === 'idle' || isOwnUi(event, options.shadowHostEl)) return;
    const snapshot = snapshotFor(targetAtEvent(event, options.shadowHostEl));
    if (!snapshot) return;
    event.preventDefault();
    event.stopPropagation();
    options.onSelect(snapshot);
  };

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);

  return {
    setActive(next) {
      active = next;
      if (!active) clearHover();
    },
    setMode(next) {
      mode = next;
      if (mode === 'idle') clearHover();
    },
    dispose() {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      if (raf) cancelAnimationFrame(raf);
      clearHover();
    },
  };
}
