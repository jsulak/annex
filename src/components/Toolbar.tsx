import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';

const DEBOUNCE_MS = 150;

export default function Toolbar() {
  const logout = useStore((s) => s.logout);
  const search = useStore((s) => s.search);
  const clearSearch = useStore((s) => s.clearSearch);
  const searchQuery = useStore((s) => s.searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (timerRef.current) clearTimeout(timerRef.current);

      if (value.trim() === '') {
        clearSearch();
        return;
      }

      timerRef.current = setTimeout(() => {
        search(value.trim());
      }, DEBOUNCE_MS);
    },
    [search, clearSearch],
  );

  // Cmd+L and / to focus the omnibar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+L or Ctrl+L
      if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      // "/" to focus — but only if not already in an input or editor
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const tag = active?.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          (active as HTMLElement)?.closest?.('.cm-editor')
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      // Escape to focus search — but not if already in the search input
      if (e.key === 'Escape' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Escape to clear and blur
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        clearSearch();
        inputRef.current?.blur();
      }
    },
    [clearSearch],
  );

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
        ref={inputRef}
        type="text"
        placeholder="Search... (Esc / Cmd+L)"
        defaultValue={searchQuery}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          padding: '6px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-editor)',
          color: 'var(--text-primary)',
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
