import React, { useEffect, useRef, useState } from 'react';
import { captureAndCropRect } from '../shared/captureCrop';
import type { PickerSnapshot } from '../shared/pickerEngine';
import type { ViewportRect } from '../shared/types';

export interface TransformAcc {
  dx: number;
  dy: number;
  newW: number;
  newH: number;
}

interface TransformLayerProps {
  snapshot: PickerSnapshot;
  onSave: (data: { acc: TransformAcc; comment?: string; screenshotBefore?: string; screenshotAfter?: string }) => void;
  onCancel: () => void;
}

type DragMode = 'drag' | 'nw' | 'ne' | 'sw' | 'se';

interface OriginalStyles {
  transform: string;
  width: string;
  height: string;
}

const MIN_SIZE = 20;

function overlayRect(rect: ViewportRect, acc: TransformAcc): ViewportRect {
  return { top: rect.top + acc.dy, left: rect.left + acc.dx, width: acc.newW, height: acc.newH };
}

function styleFor(rect: ViewportRect): React.CSSProperties {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function TransformLayer({ snapshot, onSave, onCancel }: TransformLayerProps) {
  const orig = snapshot.info.rect;
  const [acc, setAcc] = useState<TransformAcc>({ dx: 0, dy: 0, newW: orig.width, newH: orig.height });
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'select' | 'dragging' | 'resizing' | 'saveForm'>('select');
  const [screenshotBefore, setScreenshotBefore] = useState<string | undefined>();
  const [captureStatus, setCaptureStatus] = useState('capturando antes…');
  const originalStyles = useRef<OriginalStyles | null>(null);
  const dragRef = useRef<{ mode: DragMode; x: number; y: number; start: TransformAcc } | null>(null);
  const accRef = useRef(acc);
  const savedRef = useRef(false);

  useEffect(() => { accRef.current = acc; }, [acc]);

  useEffect(() => {
    const el = snapshot.el;
    originalStyles.current = { transform: el.style.transform, width: el.style.width, height: el.style.height };
    let cancelled = false;
    captureAndCropRect(orig).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setScreenshotBefore(result.payload.dataUrl);
        setCaptureStatus('antes capturado');
      } else {
        setCaptureStatus('sin captura antes; se guardará sin bloquear');
      }
    }).catch(() => {
      if (!cancelled) setCaptureStatus('sin captura antes; se guardará sin bloquear');
    });
    return () => {
      cancelled = true;
      if (!savedRef.current) restoreOriginal();
    };
  }, [snapshot.el]);

  const restoreOriginal = () => {
    const saved = originalStyles.current;
    if (!saved) return;
    snapshot.el.style.transform = saved.transform;
    snapshot.el.style.width = saved.width;
    snapshot.el.style.height = saved.height;
  };

  const applyPreview = (next: TransformAcc) => {
    const saved = originalStyles.current;
    const baseTransform = saved?.transform && saved.transform !== 'none' ? `${saved.transform} ` : '';
    snapshot.el.style.transform = `${baseTransform}translate(${Math.round(next.dx)}px, ${Math.round(next.dy)}px)`;
    snapshot.el.style.width = `${Math.round(next.newW)}px`;
    snapshot.el.style.height = `${Math.round(next.newH)}px`;
  };

  const startDrag = (mode: DragMode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { mode, x: event.clientX, y: event.clientY, start: accRef.current };
    setState(mode === 'drag' ? 'dragging' : 'resizing');
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const mx = event.clientX - drag.x;
      const my = event.clientY - drag.y;
      let next = { ...drag.start };
      if (drag.mode === 'drag') next = { ...next, dx: drag.start.dx + mx, dy: drag.start.dy + my };
      if (drag.mode.includes('e')) next.newW = Math.max(MIN_SIZE, drag.start.newW + mx);
      if (drag.mode.includes('s')) next.newH = Math.max(MIN_SIZE, drag.start.newH + my);
      if (drag.mode.includes('w')) {
        const w = Math.max(MIN_SIZE, drag.start.newW - mx);
        next = { ...next, dx: drag.start.dx + (drag.start.newW - w), newW: w };
      }
      if (drag.mode.includes('n')) {
        const h = Math.max(MIN_SIZE, drag.start.newH - my);
        next = { ...next, dy: drag.start.dy + (drag.start.newH - h), newH: h };
      }
      setAcc(next);
      applyPreview(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setState('saveForm');
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    };
  }, []);

  const cancel = () => {
    restoreOriginal();
    onCancel();
  };

  const save = async () => {
    setState('saveForm');
    const current = accRef.current;
    const after = snapshot.el.getBoundingClientRect();
    let screenshotAfter: string | undefined;
    try {
      const result = await captureAndCropRect(after);
      if (result.ok) screenshotAfter = result.payload.dataUrl;
    } catch {
      screenshotAfter = undefined;
    }
    savedRef.current = true;
    onSave({ acc: current, comment: comment.trim() || undefined, screenshotBefore, screenshotAfter });
  };

  const rect = overlayRect(orig, acc);
  const clipped = rect.left < 0 || rect.top < 0 || rect.left + rect.width > window.innerWidth || rect.top + rect.height > window.innerHeight;

  return (
    <>
      <div className="vc-transform-box" style={styleFor(rect)}>
        <button type="button" className="vc-transform-drag" onMouseDown={(event) => startDrag('drag', event)}>Mover</button>
        {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
          <button key={handle} type="button" className={`vc-transform-handle vc-${handle}`} aria-label={`resize ${handle}`} onMouseDown={(event) => startDrag(handle, event)} />
        ))}
      </div>
      <form className="vc-transform-form" style={{ top: Math.max(12, Math.min(window.innerHeight - 170, rect.top + rect.height + 8)), left: Math.max(12, Math.min(window.innerWidth - 300, rect.left)) }} onSubmit={(event) => { event.preventDefault(); void save(); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); } }}>
        <strong>Reposicionar {snapshot.info.tag}</strong>
        <small>{state === 'dragging' ? 'arrastrando…' : state === 'resizing' ? 'redimensionando…' : captureStatus}</small>
        <small>Δ {Math.round(acc.dx)}, {Math.round(acc.dy)} · {orig.width}×{orig.height}px → {Math.round(acc.newW)}×{Math.round(acc.newH)}px</small>
        {clipped && <small className="vc-warning">Elemento fuera del viewport — desplaza para capturar</small>}
        <textarea autoFocus={state === 'saveForm'} value={comment} placeholder="Comentario opcional…" onChange={(event) => setComment(event.target.value)} />
        <div className="vc-popup-actions">
          <button type="submit">Guardar</button>
          <button type="button" onClick={cancel}>Cancelar</button>
        </div>
        <small>Arrastra “Mover” o las esquinas · Ctrl/Cmd+Enter guarda · Esc cancela</small>
      </form>
    </>
  );
}
