import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';

export default function QuickOpen() {
  const notes = useStore((s) => s.notes);
  const selectNote = useStore((s) => s.selectNote);
  const setQuickOpenVisible = useStore((s) => s.setQuickOpenVisible);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? notes.filter((n) => {
        const q = query.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q)
        );
      })
    : notes;

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const close = useCallback(() => {
    setQuickOpenVisible(false);
  }, [setQuickOpenVisible]);

  const handleSelect = useCallback(
    (id: string) => {
      void selectNote(id);
      close();
    },
    [selectNote, close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex].id);
        }
        return;
      }
    },
    [filtered, selectedIndex, handleSelect, close],
  );

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
        paddingTop: '15vh',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '480px',
          maxHeight: '400px',
          background: 'var(--bg-editor)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Quick open... type to filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            padding: '10px 12px',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '12px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
              }}
            >
              No matching notes
            </div>
          )}
          {filtered.map((note, i) => (
            <div
              key={note.id}
              onClick={() => handleSelect(note.id)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                background:
                  i === selectedIndex
                    ? 'var(--bg-selected)'
                    : 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              <div>{note.title || note.id}</div>
              {note.title && (
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {note.id}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
