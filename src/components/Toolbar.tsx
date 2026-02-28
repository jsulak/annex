import { useStore } from '../store/useStore.js';

export default function Toolbar() {
  const logout = useStore((s) => s.logout);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-app)',
      }}
    >
      <input
        type="text"
        placeholder="Search..."
        disabled
        style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          padding: '6px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-editor)',
          color: 'var(--text-secondary)',
          outline: 'none',
        }}
      />
      <button
        title="New note"
        disabled
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
          cursor: 'default',
        }}
      >
        +
      </button>
      <button
        title="Settings"
        disabled
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
          cursor: 'default',
        }}
      >
        &#x2699;
      </button>
      <button
        title="Log out"
        onClick={logout}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        Log out
      </button>
    </div>
  );
}
