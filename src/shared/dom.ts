import { getRawStyles, mapStyles } from './styleMapper';
import type { ElementInfo, ViewportRect } from './types';

export function isEligibleElement(el: Element | null | undefined): el is HTMLElement {
  return !!el && el instanceof HTMLElement && el !== document.body && el !== document.documentElement;
}

export function getRoundedRect(el: Element): ViewportRect {
  const rect = el.getBoundingClientRect();
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function isViewportClipped(rect: ViewportRect, viewport = { w: window.innerWidth, h: window.innerHeight }): boolean {
  return rect.left < 0 || rect.top < 0 || rect.left + rect.width > viewport.w || rect.top + rect.height > viewport.h;
}

export function isOwnUi(event: Event, shadowHostEl: HTMLElement): boolean {
  return event.composedPath().includes(shadowHostEl);
}

export function targetFromEvent(event: Event, shadowHostEl?: HTMLElement): HTMLElement | null {
  if (shadowHostEl && isOwnUi(event, shadowHostEl)) return null;
  const target = event.target;
  return target instanceof HTMLElement ? target : null;
}

export function getElInfo(el: Element | null | undefined): ElementInfo | null {
  if (!isEligibleElement(el)) return null;
  const cs = window.getComputedStyle(el);
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter(c => c.length < 50).slice(0, 8).join(' ');
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  const parentTag = el.parentElement?.tagName.toLowerCase() || '';

  return {
    tag,
    classes,
    text,
    label,
    parentTag,
    twClasses: mapStyles(cs),
    rawStyles: getRawStyles(cs),
    rect: getRoundedRect(el),
  };
}
