import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const mod = isMac ? 'Cmd' : 'Ctrl';

const shortcuts: Array<{ keys: string; desc: string }> = [
  { keys: `${mod}+L`, desc: 'Focus search' },
  { keys: '/', desc: 'Focus search (when not editing)' },
  { keys: 'Escape', desc: 'Deselect note / clear search' },
  { keys: `${mod}+N / +`, desc: 'New note' },
  { keys: `${mod}+S`, desc: 'Save now' },
  { keys: `${mod}+Backspace`, desc: 'Delete note' },
  { keys: `${mod}+M`, desc: 'Cycle view mode' },
  { keys: `${mod}+[`, desc: 'Go back' },
  { keys: `${mod}+]`, desc: 'Go forward' },
  { keys: `${mod}+O`, desc: 'Quick open' },
  { keys: `${mod}+Shift+K`, desc: 'Tags' },
  { keys: `${mod}+Shift+B`, desc: 'Toggle backlinks' },
  { keys: `${mod}+,`, desc: 'Settings' },
  { keys: `${mod}+\\`, desc: 'Toggle file list' },
  { keys: '↑ / ↓ / j / k', desc: 'Navigate note list' },
  { keys: '?', desc: 'This help' },
];

export default function KeyboardHelp() {
  const setKeyboardHelpVisible = useStore((s) => s.setKeyboardHelpVisible);

  const close = useCallback(() => {
    setKeyboardHelpVisible(false);
  }, [setKeyboardHelpVisible]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '8vh',
        zIndex: 1000,
      }}
    >
      <div
        data-testid="keyboard-help"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--bg-editor)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          padding: '20px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 16px',
            color: 'var(--text-primary)',
          }}
        >
          Keyboard shortcuts
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.keys}>
                <td
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    padding: '4px 12px 4px 0',
                    color: 'var(--text-accent)',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'top',
                  }}
                >
                  {s.keys}
                </td>
                <td
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    padding: '4px 0',
                    color: 'var(--text-primary)',
                  }}
                >
                  {s.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
