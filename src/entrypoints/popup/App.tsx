import { useEffect, useState } from 'react';

const POPUP_STATE_MESSAGE = 'VIBE_COPILOT_POPUP_STATE';
const POPUP_TOGGLE_MESSAGE = 'VIBE_COPILOT_POPUP_TOGGLE';

type PopupOverlayState = 'loading' | 'on' | 'off' | 'restricted';

export function App() {
  const [overlayState, setOverlayState] = useState<PopupOverlayState>('loading');
  const [tabId, setTabId] = useState<number | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        setOverlayState('restricted');
        return;
      }
      setTabId(tab.id);
      chrome.runtime.sendMessage(
        { type: POPUP_STATE_MESSAGE, tabId: tab.id },
        (response?: { active?: boolean; allowed?: boolean }) => {
          if (chrome.runtime.lastError || !response || !response.allowed) {
            setOverlayState('restricted');
            return;
          }
          setOverlayState(response.active ? 'on' : 'off');
        },
      );
    });
  }, []);

  const handleToggle = () => {
    if (tabId == null || overlayState === 'restricted' || overlayState === 'loading') return;
    setOverlayState('loading');
    chrome.runtime.sendMessage(
      { type: POPUP_TOGGLE_MESSAGE, tabId },
      (response?: { active?: boolean; allowed?: boolean }) => {
        if (chrome.runtime.lastError || !response || !response.allowed) {
          setOverlayState('restricted');
          return;
        }
        setOverlayState(response.active ? 'on' : 'off');
      },
    );
  };

  return (
    <main style={{
      width: 260,
      background: 'linear-gradient(160deg, #080f20 0%, #020617 100%)',
      color: '#f8fafc',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: 0,
      margin: 0,
      borderRadius: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px 12px',
        borderBottom: '1px solid rgba(96,165,250,0.1)',
        background: 'rgba(15,23,42,0.6)',
      }}>
        <img
          src="../../icons/icon-128.png"
          alt="Vibela"
          style={{ width: 32, height: 32, objectFit: 'contain' }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', letterSpacing: '0.01em' }}>
            Vibela
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 500, letterSpacing: '0.05em' }}>
            VISUAL ANNOTATION
          </div>
        </div>
        <span style={{
          marginLeft: 'auto',
          fontSize: 9,
          fontWeight: 700,
          color: '#60a5fa',
          background: 'rgba(96,165,250,0.12)',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: 999,
          padding: '2px 8px',
          letterSpacing: '0.06em',
        }}>
          BETA
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
        {/* Toggle de la pestaña activa */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={overlayState === 'restricted' || overlayState === 'loading'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            border: overlayState === 'on' ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(96,165,250,0.3)',
            background: overlayState === 'on' ? 'rgba(34,197,94,0.15)' : 'rgba(29,78,216,0.25)',
            color: overlayState === 'on' ? '#86efac' : '#bfdbfe',
            fontSize: 12,
            fontWeight: 600,
            cursor: overlayState === 'restricted' || overlayState === 'loading' ? 'default' : 'pointer',
            opacity: overlayState === 'restricted' ? 0.5 : 1,
          }}
        >
          <span style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: overlayState === 'on' ? '#22c55e' : overlayState === 'off' ? '#64748b' : '#475569',
            boxShadow: overlayState === 'on' ? '0 0 6px #22c55e' : 'none',
            flexShrink: 0,
          }} />
          {overlayState === 'loading' && 'Comprobando…'}
          {overlayState === 'on' && 'Overlay activo — clic para desactivar'}
          {overlayState === 'off' && 'Activar overlay en esta página'}
          {overlayState === 'restricted' && 'No disponible en esta página'}
        </button>

        {/* Modos disponibles */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Herramientas
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            {[
              { dot: '#22c55e', label: 'Anotar', desc: 'Click en elementos para comentar' },
              { dot: '#f59e0b', label: 'Reposicionar', desc: 'Arrastrar y redimensionar' },
              { dot: '#a78bfa', label: 'Intercambiar', desc: 'Swap entre dos elementos' },
              { dot: '#38bdf8', label: 'Editar texto', desc: 'Doble click en texto' },
            ].map(({ dot, label, desc }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: 999, background: dot, flexShrink: 0, boxShadow: `0 0 5px ${dot}` }} />
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#475569', marginLeft: 5 }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px 12px',
        borderTop: '1px solid rgba(96,165,250,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: '#1e3a5f' }}>v0.1.0</span>
        <span style={{ fontSize: 10, color: '#1e3a5f' }}>Vibela © 2026</span>
      </div>
    </main>
  );
}
