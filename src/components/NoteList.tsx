import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import type { NoteIndex, SearchResult } from '../types.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Render text with highlighted ranges. Ranges are [offset, length]. */
function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: Array<[number, number]>;
}) {
  if (matches.length === 0) {
    return <>{text}</>;
  }

  // Sort by offset, merge overlapping
  const sorted = [...matches].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [off, len] of sorted) {
    const last = merged[merged.length - 1];
    if (last && off <= last[0] + last[1]) {
      // Overlapping or adjacent — extend
      const end = Math.max(last[0] + last[1], off + len);
      last[1] = end - last[0];
    } else {
      merged.push([off, len]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const [off, len] of merged) {
    // Clamp to text bounds
    const start = Math.max(0, off);
    const end = Math.min(text.length, off + len);
    if (start >= text.length || end <= 0) continue;

    if (cursor < start) {
      parts.push(text.slice(cursor, start));
    }
    parts.push(
      <mark
        key={start}
        style={{
          background: 'var(--text-accent)',
          color: 'var(--bg-app)',
          borderRadius: '1px',
          padding: '0 1px',
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

function isSearchResult(note: NoteIndex | SearchResult): note is SearchResult {
  return 'titleMatches' in note;
}

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

  // Reset focus index when selection is cleared or results change
  useEffect(() => {
    if (selectedId === null) {
      setFocusIndex(null);
    }
  }, [selectedId, searchResults]);

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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '8px',
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
              {isSearchResult(note) ? (
                <HighlightedText
                  text={note.title || note.filename}
                  matches={note.titleMatches}
                />
              ) : (
                note.title || note.filename
              )}
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
          {isSearching && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isSearchResult(note) ? (
                <HighlightedText
                  text={note.snippet}
                  matches={note.snippetMatches}
                />
              ) : (
                note.snippet
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
