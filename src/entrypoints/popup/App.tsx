export function App() {
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
        {/* Instrucción */}
        <div style={{
          background: 'rgba(29,78,216,0.15)',
          border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#93c5fd', marginBottom: 4 }}>
            Cómo usar
          </div>
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
            Hacé click en el ícono de la barra para activar la bolita en la página actual.
          </div>
        </div>

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
