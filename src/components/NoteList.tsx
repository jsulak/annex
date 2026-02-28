import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import type { NoteIndex, SearchResult } from '../types.js';

export default function NoteList() {
  const notes = useStore((s) => s.notes);
  const searchResults = useStore((s) => s.searchResults);
  const searchLoading = useStore((s) => s.searchLoading);
  const selectedId = useStore((s) => s.selectedId);
  const selectNote = useStore((s) => s.selectNote);
  const loading = useStore((s) => s.loading);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Show search results when searching, otherwise all notes
  const displayNotes: Array<NoteIndex | SearchResult> = searchResults ?? notes;
  const isSearching = searchResults !== null;

  // Sync focusIndex when selectedId changes (e.g. wiki-link navigation)
  useEffect(() => {
    if (selectedId === null) {
      setFocusIndex(null);
      return;
    }
    const idx = displayNotes.findIndex((n) => n.id === selectedId);
    if (idx >= 0) {
      setFocusIndex(idx);
      const el = itemRefs.current.get(idx);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedId, displayNotes]);

  const scrollIntoView = useCallback((index: number) => {
    const el = itemRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (displayNotes.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = focusIndex === null ? 0 : Math.min(focusIndex + 1, displayNotes.length - 1);
        setFocusIndex(next);
        scrollIntoView(next);
        selectNote(displayNotes[next].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // At the top of the list, return focus to the search input
        if (focusIndex === null || focusIndex === 0) {
          const searchInput = document.getElementById('search-input');
          if (searchInput) {
            searchInput.focus();
            setFocusIndex(null);
            return;
          }
        }
        const next = Math.max((focusIndex ?? 0) - 1, 0);
        setFocusIndex(next);
        scrollIntoView(next);
        selectNote(displayNotes[next].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = focusIndex ?? 0;
        if (displayNotes[idx]) {
          selectNote(displayNotes[idx].id);
        }
      }
    },
    [displayNotes, focusIndex, selectNote, scrollIntoView],
  );

  const handleFocus = useCallback(() => {
    if (focusIndex === null && displayNotes.length > 0) {
      setFocusIndex(0);
      selectNote(displayNotes[0].id);
    }
  }, [focusIndex, displayNotes, selectNote]);

  if (loading || searchLoading) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        {searchLoading ? 'Searching...' : 'Loading...'}
      </div>
    );
  }

  if (displayNotes.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        {isSearching ? 'No results found.' : 'No notes found.'}
      </div>
    );
  }

  return (
    <div
      id="note-list"
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      style={{ overflowY: 'auto', flex: 1, outline: 'none' }}
    >
      {displayNotes.map((note, index) => (
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
            }}
          >
            {note.filename.replace(/\.md$/i, '')}
          </span>
        </div>
      ))}
    </div>
  );
}
