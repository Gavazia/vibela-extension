import React, { useEffect, useRef, useState } from 'react';
import { captureAndCropRect, captureViewportWithHighlight } from '../shared/captureCrop';
import { getElInfo, isOwnUi } from '../shared/dom';
import { createPickerEngine, type PickerEngine, type PickerMode, type PickerSnapshot } from '../shared/pickerEngine';
import * as projectSync from '../shared/projectSync';
import { getAnnotationDrafts, getPrefs, setAnnotationDrafts, setPrefs, type BolitaPosition } from '../shared/storage';
import { TransformLayer, type TransformAcc } from './TransformLayer';
import type { Annotation, AnnotateRecord, ConnectionState, SwapRecord, TextEditRecord, TransformRecord, ViewportRect } from '../shared/types';

interface OverlayProps {
  active: boolean;
  allowed: boolean;
  shadowHostEl: HTMLElement;
  tabId?: number;
}

interface AnnotatePopupState {
  snapshot: PickerSnapshot;
  comment: string;
}

interface SwapPopupState {
  source: PickerSnapshot;
  target: PickerSnapshot;
  comment: string;
}

interface TextEditPopupState {
  snapshot: PickerSnapshot;
  originalText: string;
  newText: string;
  comment: string;
  saving?: boolean;
}

type Tool = 'annotate' | 'transform' | 'swap' | 'text-edit';

function rectStyle(rect: ViewportRect): React.CSSProperties {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function defaultBolitaPosition(): BolitaPosition {
  return { x: Math.max(24, window.innerWidth - 64), y: Math.max(24, window.innerHeight - 64) };
}

function clampBolitaPosition(position: BolitaPosition): BolitaPosition {
  return {
    x: Math.max(8, Math.min(window.innerWidth - 48, position.x)),
    y: Math.max(8, Math.min(window.innerHeight - 48, position.y)),
  };
}

function panelStyle(position: BolitaPosition): React.CSSProperties {
  const left = Math.max(12, Math.min(window.innerWidth - 312, position.x - 260));
  const top = Math.max(12, Math.min(window.innerHeight - 320, position.y - 276));
  return { left, top };
}

function popupStyle(rect: ViewportRect, height = 170): React.CSSProperties {
  return {
    top: Math.max(12, Math.min(window.innerHeight - height, rect.top + Math.min(rect.height, 24) + 8)),
    left: Math.max(12, Math.min(window.innerWidth - 300, rect.left)),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function newAnnotationId(prefix = 'annotation'): string {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function Overlay({ active, allowed, shadowHostEl, tabId }: OverlayProps) {
  const [pickerOn, setPickerOn] = useState(true);
  const [tool, setTool] = useState<Tool>('annotate');
  const toolRef = useRef(tool);
  const [hover, setHover] = useState<PickerSnapshot | null>(null);
  const [selected, setSelected] = useState<PickerSnapshot | null>(null);
  const [popup, setPopup] = useState<AnnotatePopupState | null>(null);
  const [transformSelected, setTransformSelected] = useState<PickerSnapshot | null>(null);
  const [transformState, setTransformState] = useState<PickerMode>('transform.select');
  const [swapSource, setSwapSource] = useState<PickerSnapshot | null>(null);
  const [swapPopup, setSwapPopup] = useState<SwapPopupState | null>(null);
  const [textEditPopup, setTextEditPopup] = useState<TextEditPopupState | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [status, setStatus] = useState('');
  // Connection state (T-12)
  const [connection, setConnection] = useState<ConnectionState>(
    projectSync.isSupported() ? 'disconnected' : 'unsupported',
  );
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const engineRef = useRef<PickerEngine | null>(null);
  const historyRef = useRef<Annotation[][]>([]);
  const mutationVersionRef = useRef(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bolitaPos, setBolitaPos] = useState<BolitaPosition>(() => defaultBolitaPosition());
  const [dragging, setDragging] = useState(false);
  const bolitaRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  // Guards the annotate save so it commits exactly once per popup, regardless of
  // which path fires (Ctrl+Enter via textarea + document keydown, save button,
  // or textarea blur on unmount). Reset when a new annotate popup opens.
  const annotateCommitRef = useRef(false);
  // Two-step confirm for the destructive "Reiniciar" (wipe-all) action.
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Native event handlers for popup buttons (React onClick unreliable in Shadow DOM)
  useEffect(() => {
    if (!popup) return;
    const id = 'vc-btn-save-annotate';
    const btn = document.getElementById(id);
    if (!btn) return;
    const handler = (e: Event) => { e.preventDefault(); void saveAnnotatePopup(); };
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, [popup, tabId]);

  useEffect(() => {
    if (!swapPopup) return;
    const id = 'vc-btn-save-swap';
    const btn = document.getElementById(id);
    if (!btn) return;
    const handler = (e: Event) => { e.preventDefault(); saveSwapPopup(); };
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, [swapPopup, tabId]);

  useEffect(() => {
    if (!textEditPopup) return;
    const id = 'vc-btn-save-textedit';
    const btn = document.getElementById(id);
    if (!btn) return;
    const handler = (e: Event) => { e.preventDefault(); void saveTextEditPopup(); };
    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, [textEditPopup, tabId]);

  useEffect(() => { toolRef.current = tool; }, [tool]);

  useEffect(() => {
    let cancelled = false;
    getPrefs().then((prefs) => {
      if (!cancelled && prefs.bolitaPosition) setBolitaPos(clampBolitaPosition(prefs.bolitaPosition));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Attempt to restore a previously connected project on mount (T-12).
  // Non-blocking: does not show the picker, only re-hydrates state if permission is still granted.
  useEffect(() => {
    if (!projectSync.isSupported()) return;
    let cancelled = false;
    projectSync.restore().then((result) => {
      if (cancelled) return;
      if (result.state === 'connected') {
        setConnection('connected');
        setProjectPath(result.path ?? null);
      } else if (result.state === 'reconnect') {
        setConnection('reconnect');
        setProjectPath(result.path ?? null);
      }
      // 'disconnected' — leave default disconnected state
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active || !panelOpen) return;
    const onOutsideMouseDown = (event: MouseEvent) => {
      // Closed Shadow DOM retargets internal events to the host.
      // If the click landed inside our shadow host, it was on our UI — don't close.
      if (event.target instanceof Node && shadowHostEl.contains(event.target)) return;
      setPanelOpen(false);
    };
    document.addEventListener('mousedown', onOutsideMouseDown, true);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown, true);
  }, [active, panelOpen, shadowHostEl]);

  useEffect(() => {
    if (panelOpen && hover) setPanelOpen(false);
  }, [hover, panelOpen]);

  // E2E test bridge via CustomEvent (shared between page and content-script worlds)
  // E2E test bridge. Only mounted while the overlay is ACTIVE — a page cannot
  // activate the overlay itself (that requires the toolbar click routed through
  // the background), so an arbitrary page script can never reach this listener
  // unless the user has explicitly opened Vibela on that tab.
  useEffect(() => {
    if (!active) return;
    const onTestCmd = (e: Event) => {
      const cmd = (e as CustomEvent).detail?.cmd;
      if (cmd === 'save-annotate') void saveAnnotatePopup();
      else if (cmd === 'save-swap') saveSwapPopup();
      else if (cmd === 'save-textedit') { void saveTextEditPopup(); }
    };
    document.addEventListener('vibe:test-cmd', onTestCmd);
    return () => document.removeEventListener('vibe:test-cmd', onTestCmd);
  }, [active, tabId, popup, swapPopup, textEditPopup]);

  const persistBolitaPosition = (position: BolitaPosition) => {
    void setPrefs({ bolitaPosition: position }).catch((error) => console.warn('Vibela bolita position write failed', error));
  };

  const persistAnnotations = async (next: Annotation[]) => {
    if (!tabId) {
      setStatus('esperando estado de la pestaña; intenta de nuevo');
      return;
    }
    await setAnnotationDrafts(tabId, next).catch((error) => {
      console.warn('Vibela annotation draft write failed', error);
      setStatus('no se pudo guardar el borrador local');
    });
  };

  const replaceAnnotations = (update: Annotation[] | ((current: Annotation[]) => Annotation[]), remember = true) => {
    setAnnotations((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      mutationVersionRef.current += 1;
      if (remember) historyRef.current = [...historyRef.current, current].slice(-20);
      void persistAnnotations(next);
      return next;
    });
  };

  const resetTransient = () => {
    setPopup(null);
    setTransformSelected(null);
    setSwapSource(null);
    setSwapPopup(null);
    setTextEditPopup(null);
    setTransformState('transform.select');
  };

  // "Reiniciar" = start over from zero. First tap arms the action (so a stray
  // click can't wipe annotations); a second tap within 3s clears every saved
  // note plus all transient state. replaceAnnotations keeps the old list in the
  // undo history, so Ctrl+Z can still recover from an accidental wipe.
  const handleReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setStatus('toca otra vez para borrar todo');
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    setResetArmed(false);
    resetTransient();
    setSelected(null);
    setHover(null);
    replaceAnnotations([]);
    setStatus('reiniciado · 0 anotaciones');
  };

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const saveTransform = (snapshot: PickerSnapshot, data: { acc: TransformAcc; comment?: string; screenshotBefore?: string; screenshotAfter?: string }) => {
    if (!tabId) {
      setStatus('esperando estado de la pestaña; intenta de nuevo');
      return;
    }
    const { acc } = data;
    const record: TransformRecord = {
      id: newAnnotationId('transform'),
      createdAt: Date.now(),
      type: 'transform',
      elementInfo: snapshot.info,
      comment: data.comment,
      transform: {
        dx: Math.round(acc.dx),
        dy: Math.round(acc.dy),
        origW: snapshot.info.rect.width,
        origH: snapshot.info.rect.height,
        newW: Math.round(acc.newW),
        newH: Math.round(acc.newH),
      },
      screenshotBefore: data.screenshotBefore,
      screenshotAfter: data.screenshotAfter,
    };
    replaceAnnotations((current) => [...current, record]);
    setSelected(snapshot);
    setTransformSelected(null);
    setTransformState('transform.select');
    setStatus(data.screenshotBefore || data.screenshotAfter ? 'reposición guardada con captura' : 'reposición guardada sin captura');
  };

  const cancelTransform = () => {
    setTransformSelected(null);
    setTransformState('transform.select');
    setStatus('reposición cancelada');
  };

  // Full-viewport location screenshot: hide the Vibela overlay for a couple of
  // frames so it never appears in the shot, then capture the visible tab with a
  // highlight box over the annotated element (shows WHERE it is on the page).
  const captureLocationShot = async (el: Element): Promise<string | undefined> => {
    const host = shadowHostEl;
    const prevVisibility = host.style.visibility;
    host.style.visibility = 'hidden';
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const result = await captureViewportWithHighlight(el.getBoundingClientRect());
      return result.ok ? result.payload.dataUrl : undefined;
    } catch {
      return undefined;
    } finally {
      host.style.visibility = prevVisibility;
    }
  };

  // Single commit path shared by the explicit save and the blur save so they can
  // never drift apart again (the missing screenshot bug came from two code paths).
  const commitAnnotation = async (snapshot: PickerSnapshot, comment: string) => {
    const screenshot = await captureLocationShot(snapshot.el);
    const record: AnnotateRecord = {
      id: newAnnotationId(),
      createdAt: Date.now(),
      type: 'annotate',
      elementInfo: snapshot.info,
      comment,
      screenshot,
    };
    replaceAnnotations((current) => [...current, record]);
    setSelected(snapshot);
    setPopup(null);
    setStatus(screenshot ? 'anotación guardada con captura' : 'anotación guardada sin captura');
  };

  const saveAnnotatePopup = async () => {
    if (!popup) return;
    const comment = popup.comment.trim();
    if (!comment) {
      setStatus('añade un comentario antes de guardar');
      return;
    }
    if (!tabId) {
      setStatus('esperando estado de la pestaña; intenta de nuevo');
      return;
    }
    if (annotateCommitRef.current) return; // already committed (blur/button/double-keydown race)
    annotateCommitRef.current = true;
    await commitAnnotation(popup.snapshot, comment);
  };

  // Simplified: save on blur (no warning if empty — just close)
  const saveAnnotateOnBlur = () => {
    if (annotateCommitRef.current) { setPopup(null); return; } // explicit save already ran
    if (!popup) return;
    const comment = popup.comment.trim();
    if (!comment || !tabId) { setPopup(null); return; }
    annotateCommitRef.current = true;
    void commitAnnotation(popup.snapshot, comment);
  };

  const saveSwapPopup = () => {
    if (!swapPopup) return;
    if (!tabId) {
      setStatus('esperando estado de la pestaña; intenta de nuevo');
      return;
    }
    const record: SwapRecord = {
      id: newAnnotationId('swap'),
      createdAt: Date.now(),
      type: 'swap',
      elementInfo: swapPopup.source.info,
      targetInfo: swapPopup.target.info,
      comment: swapPopup.comment.trim() || undefined,
    };
    replaceAnnotations((current) => [...current, record]);
    setSelected(swapPopup.target);
    setSwapSource(null);
    setSwapPopup(null);
    setStatus('intercambio guardado');
  };

  const saveTextEditPopup = async () => {
    if (!textEditPopup || textEditPopup.saving) return;
    const newText = textEditPopup.newText.trim();
    if (!newText) {
      setStatus('añade el texto propuesto antes de guardar');
      return;
    }
    if (!tabId) {
      setStatus('esperando estado de la pestaña; intenta de nuevo');
      return;
    }
    setTextEditPopup({ ...textEditPopup, saving: true });
    let screenshot: string | undefined;
    try {
      const result = await captureAndCropRect(textEditPopup.snapshot.el.getBoundingClientRect());
      if (result.ok) screenshot = result.payload.dataUrl;
    } catch {
      screenshot = undefined;
    }
    const record: TextEditRecord = {
      id: newAnnotationId('text-edit'),
      createdAt: Date.now(),
      type: 'text-edit',
      elementInfo: textEditPopup.snapshot.info,
      originalText: textEditPopup.originalText,
      newText,
      comment: textEditPopup.comment.trim() || undefined,
      screenshot,
    };
    replaceAnnotations((current) => [...current, record]);
    setSelected(textEditPopup.snapshot);
    setTextEditPopup(null);
    setStatus(screenshot ? 'edición de texto guardada con captura' : 'edición de texto guardada sin captura');
  };

  const openTextEdit = (snapshot: PickerSnapshot) => {
    const originalText = snapshot.info.text.trim();
    if (!originalText) {
      setStatus('el elemento no tiene texto editable visible');
      return;
    }
    setPopup(null);
    setTransformSelected(null);
    setSwapPopup(null);
    setTextEditPopup({ snapshot, originalText, newText: originalText, comment: '' });
  };

  const undoLastMutation = () => {
    const previous = historyRef.current.at(-1);
    if (!previous) {
      setStatus('sin cambios para deshacer');
      return;
    }
    historyRef.current = historyRef.current.slice(0, -1);
    replaceAnnotations(previous, false);
    setStatus('última anotación deshecha');
  };

  useEffect(() => {
    const engine = createPickerEngine({
      shadowHostEl,
      onHover: setHover,
      onSelect: (snapshot) => {
        setSelected(snapshot);
        setStatus('');
        if (toolRef.current === 'transform') {
          setPopup(null);
          setSwapSource(null);
          setSwapPopup(null);
          setTextEditPopup(null);
          setTransformSelected(snapshot);
          setTransformState('transform.saveForm');
          return;
        }
        if (toolRef.current === 'swap') {
          setPopup(null);
          setTransformSelected(null);
          setTextEditPopup(null);
          setSwapSource((source) => {
            if (!source) {
              setStatus('origen seleccionado; elige destino');
              return snapshot;
            }
            setSwapPopup({ source, target: snapshot, comment: '' });
            setStatus('');
            return source;
          });
          return;
        }
        if (toolRef.current === 'text-edit') {
          setTransformSelected(null);
          setSwapSource(null);
          openTextEdit(snapshot);
          return;
        }
        setTransformSelected(null);
        setSwapSource(null);
        setTextEditPopup(null);
        annotateCommitRef.current = false;
        setPopup({ snapshot, comment: '' });
      },
    });
    engineRef.current = engine;
    return () => engine.dispose();
  }, [shadowHostEl]);

  useEffect(() => {
    if (!active) return;
    const onDoubleClick = (event: MouseEvent) => {
      if (!pickerOn || popup || transformSelected || swapPopup || textEditPopup || isOwnUi(event, shadowHostEl)) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof HTMLElement)) return;
      const info = target === document.body || target === document.documentElement ? null : target;
      if (!info) return;
      const elementInfo = getElInfo(target);
      if (!elementInfo?.text.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      openTextEdit({ el: target, info: elementInfo });
    };
    document.addEventListener('dblclick', onDoubleClick, true);
    return () => document.removeEventListener('dblclick', onDoubleClick, true);
  }, [active, pickerOn, shadowHostEl, popup, transformSelected, swapPopup, textEditPopup]);

  useEffect(() => {
    const engine = engineRef.current;
    const canPick = active && pickerOn && !panelOpen && !popup && !transformSelected && !swapPopup && !textEditPopup;
    engine?.setActive(canPick);
    let mode: PickerMode = 'idle';
    if (canPick) {
      if (tool === 'transform') mode = 'transform.select';
      else if (tool === 'swap') mode = swapSource ? 'swap.second' : 'swap.first';
      else if (tool === 'text-edit') mode = 'text-edit';
      else mode = 'annotate';
    } else if (transformSelected) mode = transformState;
    else if (swapPopup) mode = 'swap.popup';
    else if (textEditPopup) mode = 'text-edit.popup';
    engine?.setMode(mode);
    if (!active) { setHover(null); setSelected(null); resetTransient(); }
  }, [active, pickerOn, panelOpen, popup, tool, transformSelected, transformState, swapSource, swapPopup, textEditPopup]);

  useEffect(() => {
    if (!active || !tabId) return;
    const versionAtLoadStart = mutationVersionRef.current;
    let cancelled = false;

    getAnnotationDrafts(tabId).then((drafts) => {
      if (cancelled || mutationVersionRef.current !== versionAtLoadStart) return;
      setAnnotations(drafts.annotations);
      historyRef.current = [];
    }).catch(() => {
      if (cancelled || mutationVersionRef.current !== versionAtLoadStart) return;
      setAnnotations([]);
    });

    return () => { cancelled = true; };
  }, [active, tabId]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (panelOpen) {
          event.preventDefault();
          setPanelOpen(false);
          return;
        }
        if (textEditPopup) {
          event.preventDefault();
          setTextEditPopup(null);
          setStatus('edición de texto cancelada');
          return;
        }
        if (popup) {
          event.preventDefault();
          setPopup(null);
          setStatus('anotación cancelada');
          return;
        }
        if (swapPopup) {
          event.preventDefault();
          setSwapPopup(null);
          setStatus('destino cancelado; elige otro destino');
          return;
        }
        if (swapSource) {
          event.preventDefault();
          setSwapSource(null);
          setStatus('intercambio reiniciado');
          return;
        }
        if (transformSelected) {
          event.preventDefault();
          cancelTransform();
          return;
        }
        if (pickerOn) {
          event.preventDefault();
          setPickerOn(false);
          setStatus('overlay pausado');
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isEditableTarget(event.target)) {
        event.preventDefault();
        undoLastMutation();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (popup) { event.preventDefault(); void saveAnnotatePopup(); }
        else if (swapPopup) { event.preventDefault(); saveSwapPopup(); }
        else if (textEditPopup) { event.preventDefault(); void saveTextEditPopup(); }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, pickerOn, popup, swapPopup, swapSource, textEditPopup, transformSelected, annotations, panelOpen, tabId]);

  // ---------------------------------------------------------------------------
  // Project connection handlers (T-12)
  // ---------------------------------------------------------------------------

  async function handleConnect() {
    if (!projectSync.isSupported()) return;
    setConnection('connecting');
    try {
      const result = await projectSync.connect();
      setConnection('connected');
      setProjectPath(result.path);
      setStatus(`proyecto conectado: ${result.path}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled the picker — silent per REQ-1.6 / design ADR-1.
        setConnection('disconnected');
        setProjectPath(null);
        // No status update: spec says "show no error; return to previous state silently"
        return;
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setConnection('disconnected');
        setStatus('permiso denegado');
        return;
      }
      setConnection('disconnected');
      setStatus(err instanceof Error ? err.message : 'error al conectar');
    }
  }

  async function handleReconnect() {
    if (!projectSync.isSupported()) return;
    setConnection('connecting');
    try {
      const result = await projectSync.reconnect();
      setConnection('connected');
      setProjectPath(result.path);
      setStatus(`proyecto conectado: ${result.path}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 'prompt' — user dismissed permission dialog without granting or denying.
        // Do NOT show "permiso denegado" for this case per design review note.
        setConnection('reconnect');
        return;
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setConnection('disconnected');
        setStatus('permiso denegado');
        return;
      }
      setConnection('disconnected');
      setProjectPath(null);
      setStatus(err instanceof Error ? err.message : 'error al reconectar');
    }
  }

  async function handleDisconnect() {
    await projectSync.disconnect();
    setConnection('disconnected');
    setProjectPath(null);
    setStatus('proyecto desconectado');
  }

  async function handleSync() {
    if (connection !== 'connected') {
      setStatus('No hay proyecto conectado. Conectá un proyecto primero.');
      return;
    }
    if (annotations.length === 0) {
      setStatus('nada que sincronizar — primero anotá algo');
      return;
    }
    setStatus('sincronizando…');
    try {
      const result = await projectSync.sync(annotations, { pathname: window.location.pathname });
      if (result.error === 'not-connected') {
        setStatus('No hay proyecto conectado. Conectá un proyecto primero.');
        setConnection('disconnected');
        return;
      }
      const plural = result.count !== 1;
      const msg = `Sincronizado · ${result.count} tarea${plural ? 's' : ''} escrita${plural ? 's' : ''} a .vibela/`;
      setStatus(msg);
      // Keep the confirmation up briefly, then clear it unless a newer status replaced it.
      window.setTimeout(() => setStatus((s) => (s === msg ? '' : s)), 3000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'falló la sincronización');
    }
  }

  const startBolitaDrag = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { dx: event.clientX - bolitaPos.x, dy: event.clientY - bolitaPos.y, moved: false };
    setDragging(true);
    const onMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      dragRef.current.moved = true;
      setBolitaPos(clampBolitaPosition({ x: moveEvent.clientX - dragRef.current.dx, y: moveEvent.clientY - dragRef.current.dy }));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      setBolitaPos((current) => {
        const next = clampBolitaPosition(current);
        persistBolitaPosition(next);
        return next;
      });
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  };

  const togglePanel = () => {
    if (dragRef.current?.moved) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;
    setHover(null);
    setPanelOpen((open) => !open);
  };

  const setMode = (next: Tool) => {
    setTool(next);
    resetTransient();
    setPickerOn(true);
    setPanelOpen(false);
    setStatus(next === 'swap' ? 'elige origen' : next === 'text-edit' ? 'doble click en un elemento con texto' : '');
  };

  const selecting = active && pickerOn && !panelOpen && !popup && !transformSelected && !swapPopup && !textEditPopup;
  const bolitaMode = selecting ? tool : undefined;

  if (!allowed || !active) return null;

  return (
    <>
      {hover && <div className="vc-highlight" style={rectStyle(hover.info.rect)} />}
      {selected && <div className="vc-selected" style={rectStyle(selected.info.rect)} />}
      {swapSource && !swapPopup && <div className="vc-selected vc-swap-source" style={rectStyle(swapSource.info.rect)} />}
      {transformSelected && <TransformLayer snapshot={transformSelected} onSave={(data) => saveTransform(transformSelected, data)} onCancel={cancelTransform} />}
      {popup && (
        <div className="vc-annotate-popup vc-popup-simple" style={popupStyle(popup.snapshot.info.rect, 96)}>
          <textarea
            autoFocus
            value={popup.comment}
            placeholder="Escribe tu anotación…"
            onChange={(event) => setPopup({ ...popup, comment: event.target.value })}
            onBlur={saveAnnotateOnBlur}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void saveAnnotatePopup();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setPopup(null);
                setStatus('anotación cancelada');
              }
            }}
          />
        </div>
      )}
      {swapPopup && (
        <div className="vc-annotate-popup" style={popupStyle(swapPopup.target.info.rect)}>
          <strong>Intercambiar {swapPopup.source.info.tag} → {swapPopup.target.info.tag}</strong>
          <small>Origen: “{swapPopup.source.info.text || swapPopup.source.info.classes || swapPopup.source.info.tag}”</small>
          <small>Destino: “{swapPopup.target.info.text || swapPopup.target.info.classes || swapPopup.target.info.tag}”</small>
          <textarea autoFocus value={swapPopup.comment} placeholder="Comentario opcional…" onChange={(event) => setSwapPopup({ ...swapPopup, comment: event.target.value })} />
          <div className="vc-popup-actions">
            <button type="button" id="vc-btn-save-swap" onClick={() => saveSwapPopup()}>Guardar</button>
            <button type="button" onClick={() => { setSwapPopup(null); setStatus('destino cancelado; elige otro destino'); }}>Cancelar</button>
          </div>
          <small>Ctrl/Cmd+Enter guarda · Esc vuelve al segundo paso</small>
        </div>
      )}
      {textEditPopup && (
        <div className="vc-annotate-popup" style={popupStyle(textEditPopup.snapshot.info.rect, 240)}>
          <strong>Editar texto {textEditPopup.snapshot.info.tag}</strong>
          <small>Actual: “{textEditPopup.originalText}”</small>
          <textarea autoFocus value={textEditPopup.newText} placeholder="Texto propuesto…" onChange={(event) => setTextEditPopup({ ...textEditPopup, newText: event.target.value })} />
          <textarea value={textEditPopup.comment} placeholder="Comentario opcional…" onChange={(event) => setTextEditPopup({ ...textEditPopup, comment: event.target.value })} />
          <div className="vc-popup-actions">
            <button type="button" id="vc-btn-save-textedit" disabled={textEditPopup.saving} onClick={() => { void saveTextEditPopup(); }}>{textEditPopup.saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => { setTextEditPopup(null); setStatus('edición de texto cancelada'); }}>Cancelar</button>
          </div>
          <small>Ctrl/Cmd+Enter guarda · Esc cancela · captura opcional</small>
        </div>
      )}
      <button
        ref={bolitaRef}
        type="button"
        className={`vc-bolita${selecting ? ' is-dim' : ''}${panelOpen ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
        data-mode={bolitaMode}
        style={{ left: bolitaPos.x, top: bolitaPos.y }}
        aria-label="Abrir Vibela"
        aria-expanded={panelOpen}
        onMouseDown={startBolitaDrag}
        onClick={togglePanel}
      >
        <img
          src={chrome.runtime.getURL('icons/icon-128.png')}
          alt="Vibela"
          draggable={false}
        />
      </button>
      {panelOpen && (
        <div ref={panelRef} className="vc-panel" style={panelStyle(bolitaPos)} role="region" aria-label="Vibela overlay">
          {/* Header */}
          <div className="vc-panel-header">
            <img src={chrome.runtime.getURL('icons/icon-128.png')} alt="" />
            <strong>Vibela</strong>
          </div>

          <div className="vc-panel-body">
            {/* Modos */}
            <div>
              <div className="vc-panel-section-label">Herramienta</div>
              <div className="vc-modes" aria-label="Modos de selección">
                <button type="button" className={tool === 'annotate' ? 'is-on' : ''} onClick={() => setMode('annotate')}>
                  <span className="vc-mode-dot vc-dot-annotate" />
                  Anotar
                </button>
                <button type="button" className={tool === 'transform' ? 'is-on' : ''} onClick={() => setMode('transform')}>
                  <span className="vc-mode-dot vc-dot-transform" />
                  Reposicionar
                </button>
                <button type="button" className={tool === 'swap' ? 'is-on' : ''} onClick={() => setMode('swap')}>
                  <span className="vc-mode-dot vc-dot-swap" />
                  Intercambiar
                </button>
                <button type="button" className={tool === 'text-edit' ? 'is-on' : ''} onClick={() => setMode('text-edit')}>
                  <span className="vc-mode-dot vc-dot-textedit" />
                  Editar texto
                </button>
              </div>
            </div>

            {/* Acciones */}
            <div className="vc-actions">
              <button
                type="button"
                className={pickerOn ? 'is-on' : ''}
                onClick={() => { setPickerOn((v) => !v); setPanelOpen(false); }}
              >
                {pickerOn ? '⏸ Pausar picker' : '▶ Activar picker'}
              </button>

              {/* Connect / reconnect / connected affordance (T-12) */}
              {connection === 'unsupported' && (
                <button type="button" disabled>
                  FS API no soportada
                </button>
              )}
              {connection === 'disconnected' && (
                <button
                  type="button"
                  data-testid="vc-btn-connect"
                  onClick={() => { void handleConnect(); }}
                >
                  Conectar proyecto
                </button>
              )}
              {connection === 'connecting' && (
                <button type="button" disabled>Conectando…</button>
              )}
              {connection === 'reconnect' && (
                <button
                  type="button"
                  data-testid="vc-btn-reconnect"
                  onClick={() => { void handleReconnect(); }}
                >
                  Reconectar {projectPath ? `(${projectPath})` : ''}
                </button>
              )}
              {connection === 'connected' && (
                <button
                  type="button"
                  data-testid="vc-btn-disconnect"
                  title="Cambiar proyecto"
                  onClick={() => { void handleDisconnect(); }}
                >
                  ✓ {projectPath ?? 'conectado'}
                </button>
              )}

              {/* Sincronizar — enabled only when connected (T-12) */}
              <button
                type="button"
                data-testid="vc-btn-sync"
                disabled={connection !== 'connected' || annotations.length === 0}
                onClick={() => { void handleSync(); }}
              >
                Sincronizar
              </button>

              <button
                type="button"
                className={resetArmed ? 'is-danger' : ''}
                onClick={handleReset}
              >{resetArmed ? '↺ ¿Borrar todo?' : '↺ Reiniciar'}</button>
            </div>
          </div>

          {/* Footer */}
          <div className="vc-panel-footer">
            <span className="vc-count">
              <strong>{annotations.length}</strong> anotación{annotations.length !== 1 ? 'es' : ''}
            </span>
            {selected
              ? <span className="vc-info">✓ {selected.info.tag}{selected.info.classes ? ` .${selected.info.classes.split(' ')[0]}` : ''}</span>
              : <span className="vc-info">{tool === 'swap' && swapSource ? '→ Elige destino' : 'Hover + click en un elemento'}</span>
            }
            {status && <span className="vc-status">{status}</span>}
          </div>
        </div>
      )}
    </>
  );
}
