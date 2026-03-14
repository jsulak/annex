import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { apiFetch } from '../api/client.js';
import type { NoteIndex, SearchResult } from '../types.js';
import ContextMenu from './ContextMenu.js';

const PULL_THRESHOLD = 60;
const PULL_RESISTANCE = 0.5;

interface ContextMenuState {
  x: number;
  y: number;
  noteId: string;
  noteFilename: string;
}

export default function NoteList() {
  const notes = useStore((s) => s.notes);
  const searchResults = useStore((s) => s.searchResults);
  const searchLoading = useStore((s) => s.searchLoading);
  const selectedId = useStore((s) => s.selectedId);
  const selectNote = useStore((s) => s.selectNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const renameNoteInList = useStore((s) => s.renameNoteInList);
  const loading = useStore((s) => s.loading);
  const fetchNotes = useStore((s) => s.fetchNotes);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartYRef = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<{ noteId: string; filename: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const clickingRef = useRef(false);

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

  // Focus rename input when it appears
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // All touch handlers use native listeners so preventDefault() works on touchmove
  // and so that dispatched TouchEvents in tests fire reliably.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop === 0 && e.touches.length > 0) {
        touchStartYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
        pullDistanceRef.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || e.touches.length === 0) return;
      const dy = e.touches[0].clientY - touchStartYRef.current;
      if (dy > 0) {
        e.preventDefault();
        const dist = Math.min(dy * PULL_RESISTANCE, PULL_THRESHOLD * 1.5);
        pullDistanceRef.current = dist;
        setPullDistance(dist);
      } else {
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      const dist = pullDistanceRef.current;
      setPullDistance(0);
      pullDistanceRef.current = 0;
      if (dist >= PULL_THRESHOLD) {
        setRefreshing(true);
        void fetchNotes().then(() => setRefreshing(false));
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [fetchNotes]);

  const scrollIntoView = useCallback((index: number) => {
    const el = itemRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (displayNotes.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const next = focusIndex === null ? 0 : Math.min(focusIndex + 1, displayNotes.length - 1);
        setFocusIndex(next);
        scrollIntoView(next);
        void selectNote(displayNotes[next].id);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
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
        void selectNote(displayNotes[next].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = focusIndex ?? 0;
        if (displayNotes[idx]) {
          void selectNote(displayNotes[idx].id);
        }
      }
    },
    [displayNotes, focusIndex, selectNote, scrollIntoView],
  );

  const handleFocus = useCallback(() => {
    // Skip auto-select when focus was triggered by a mouse click on a list item —
    // the item's own onClick will handle selection. Only auto-select when focus
    // arrives via keyboard (e.g. ArrowDown from search, Tab).
    if (clickingRef.current) return;
    if (focusIndex === null && displayNotes.length > 0) {
      setFocusIndex(0);
      void selectNote(displayNotes[0].id);
    }
  }, [focusIndex, displayNotes, selectNote]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, note: NoteIndex | SearchResult) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        noteId: note.id,
        noteFilename: note.filename,
      });
    },
    [],
  );

  const handleRename = useCallback(async () => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null);
      return;
    }

    let newFilename = renameValue.trim();
    if (!newFilename.endsWith('.md')) {
      newFilename += '.md';
    }

    if (newFilename === renaming.filename) {
      setRenaming(null);
      return;
    }

    try {
      const res = await apiFetch(
        `/api/v1/notes/${encodeURIComponent(renaming.noteId)}/rename`,
        {
          method: 'POST',
          body: JSON.stringify({ newFilename }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        // Update filename in-place — avoids race with SSE note:deleted event
        renameNoteInList(renaming.noteId, updated.filename, updated.title);
        if (useStore.getState().selectedId === renaming.noteId) {
          await useStore.getState().selectNote(renaming.noteId);
        }
      }
    } catch {
      // Ignore errors
    }
    setRenaming(null);
  }, [renaming, renameValue, renameNoteInList]);

  const handleDelete = useCallback(
    async (noteId: string, noteFilename: string) => {
      const title = noteFilename.replace(/\.md$/i, '');
      if (!window.confirm(`Delete "${title}"? It will be moved to _trash/.`)) return;
      await deleteNote(noteId);
    },
    [deleteNote],
  );

  const indicatorHeight = refreshing ? 40 : pullDistance;
  const indicatorLabel = refreshing
    ? 'Refreshing\u2026'
    : pullDistance >= PULL_THRESHOLD
      ? 'Release to refresh'
      : 'Pull to refresh';

  const isEmpty = !loading && !searchLoading && displayNotes.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div
        data-testid="pull-refresh-indicator"
        style={{
          height: indicatorHeight,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          transition: pullDistance === 0 && !refreshing ? 'height 0.2s ease' : 'none',
        }}
      >
        {indicatorHeight > 10 ? indicatorLabel : null}
      </div>
      <div
        id="note-list"
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onMouseDown={() => { clickingRef.current = true; }}
        onMouseUp={() => { clickingRef.current = false; }}
        style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, outline: 'none' }}
      >
        {isEmpty && (
          <div style={{ padding: '16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
            {isSearching ? 'No results found.' : 'No notes found.'}
          </div>
        )}
      {displayNotes.map((note, index) => (
        <div
          key={note.id}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
            else itemRefs.current.delete(index);
          }}
          onClick={() => {
            void selectNote(note.id);
            setFocusIndex(index);
          }}
          onContextMenu={(e) => handleContextMenu(e, note)}
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
          {renaming && renaming.noteId === note.id ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenaming(null);
                }
                e.stopPropagation();
              }}
              onBlur={handleRename}
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                padding: '2px 4px',
                border: '1px solid var(--text-accent)',
                borderRadius: '2px',
                background: 'var(--bg-editor)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
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
          )}
        </div>
      ))}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Rename',
              onClick: () => {
                setRenaming({
                  noteId: contextMenu.noteId,
                  filename: contextMenu.noteFilename,
                });
                setRenameValue(contextMenu.noteFilename.replace(/\.md$/i, ''));
              },
            },
            {
              label: 'Delete',
              danger: true,
              onClick: () => handleDelete(contextMenu.noteId, contextMenu.noteFilename),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
    </div>
  );
}
