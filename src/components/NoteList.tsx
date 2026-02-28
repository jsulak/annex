import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function NoteList() {
  const notes = useStore((s) => s.notes);
  const selectedId = useStore((s) => s.selectedId);
  const selectNote = useStore((s) => s.selectNote);
  const loading = useStore((s) => s.loading);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const scrollIntoView = useCallback((index: number) => {
    const el = itemRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (notes.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, notes.length - 1);
          scrollIntoView(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          scrollIntoView(next);
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = focusIndex ?? 0;
        if (notes[idx]) {
          selectNote(notes[idx].id);
        }
      }
    },
    [notes, focusIndex, selectNote, scrollIntoView],
  );

  const handleFocus = useCallback(() => {
    if (focusIndex === null && notes.length > 0) {
      setFocusIndex(0);
    }
  }, [focusIndex, notes.length]);

  if (loading) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        Loading...
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        No notes found.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      style={{ overflowY: 'auto', flex: 1, outline: 'none' }}
    >
      {notes.map((note, index) => (
        <div
          key={note.id}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
            else itemRefs.current.delete(index);
          }}
          onClick={() => {
            selectNote(note.id);
            setFocusIndex(index);
          }}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
            background:
              note.id === selectedId
                ? 'var(--bg-selected)'
                : index === focusIndex
                  ? 'color-mix(in srgb, var(--bg-selected) 50%, transparent)'
                  : 'transparent',
            borderBottom: '1px solid var(--border)',
            outline:
              index === focusIndex ? '1px solid var(--text-accent)' : 'none',
            outlineOffset: '-1px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {note.title || note.filename}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            {formatDate(note.modifiedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
