import { useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';

const DEBOUNCE_MS = 150;

export default function Toolbar() {
  const logout = useStore((s) => s.logout);
  const search = useStore((s) => s.search);
  const clearSearch = useStore((s) => s.clearSearch);
  const searchQuery = useStore((s) => s.searchQuery);
  const createNote = useStore((s) => s.createNote);
  const setNewNoteDialogVisible = useStore((s) => s.setNewNoteDialogVisible);
  const deselectNote = useStore((s) => s.deselectNote);
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);
  const canGoBack = useStore((s) => s.canGoBack());
  const canGoForward = useStore((s) => s.canGoForward());
  const setSettingsVisible = useStore((s) => s.setSettingsVisible);
  const setKeyboardHelpVisible = useStore((s) => s.setKeyboardHelpVisible);
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

  // Global keyboard shortcuts
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
        deselectNote();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deselectNote]);

  const searchResults = useStore((s) => s.searchResults);

  // Escape to clear and blur; Enter on empty results to create note
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const noteList = document.getElementById('note-list');
        if (noteList) {
          noteList.focus();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        clearSearch();
        inputRef.current?.blur();
      } else if (e.key === 'Enter' && searchResults && searchResults.length === 0) {
        const query = inputRef.current?.value.trim();
        if (query) {
          if (inputRef.current) inputRef.current.value = '';
          clearSearch();
          createNote(query);
        }
      }
    },
    [clearSearch, searchResults, createNote],
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
      <span className="toolbar-nav-buttons" style={{ display: 'contents' }}>
        <button
          title="Back (Cmd+[)"
          disabled={!canGoBack}
          onClick={goBack}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            padding: '4px 8px',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--bg-app)',
            color: canGoBack ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: canGoBack ? 'pointer' : 'default',
            opacity: canGoBack ? 1 : 0.4,
          }}
        >
          &#x25C0;
        </button>
        <button
          title="Forward (Cmd+])"
          disabled={!canGoForward}
          onClick={goForward}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            padding: '4px 8px',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--bg-app)',
            color: canGoForward ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: canGoForward ? 'pointer' : 'default',
            opacity: canGoForward ? 1 : 0.4,
          }}
        >
          &#x25B6;
        </button>
      </span>
      <input
        id="search-input"
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
        className="toolbar-btn"
        title="New note"
        onClick={() => setNewNoteDialogVisible(true)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        +
      </button>
      <button
        className="toolbar-btn"
        title="Settings (Cmd+,)"
        onClick={() => setSettingsVisible(true)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        &#x2699;
      </button>
      <button
        className="toolbar-btn toolbar-help-btn"
        title="Keyboard shortcuts (?)"
        onClick={() => setKeyboardHelpVisible(true)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          padding: '4px 10px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        ?
      </button>
      <button
        className="toolbar-btn"
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
