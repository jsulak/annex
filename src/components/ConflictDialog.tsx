import { useStore } from '../store/useStore.js';

export default function ConflictDialog() {
  const conflict = useStore((s) => s.conflict);
  const resolveConflict = useStore((s) => s.resolveConflict);

  if (!conflict) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '420px',
          background: 'var(--bg-editor)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          padding: '20px',
        }}
      >
        <h3
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            color: 'var(--text-primary)',
          }}
        >
          This note was changed externally
        </h3>
        <p
          style={{
            margin: '0 0 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          The file on disk has changed since you started editing.
          Choose which version to keep.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => resolveConflict('server')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '6px 14px',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Use server version
          </button>
          <button
            onClick={() => resolveConflict('local')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '6px 14px',
              border: '1px solid var(--text-accent)',
              borderRadius: '3px',
              background: 'var(--text-accent)',
              color: 'var(--bg-app)',
              cursor: 'pointer',
            }}
          >
            Keep my changes
          </button>
        </div>
      </div>
    </div>
  );
}
