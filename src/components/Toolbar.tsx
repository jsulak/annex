import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';

const DEBOUNCE_MS = 150;
const MAX_HASHTAG_SUGGESTIONS = 8;

interface HashtagToken {
  from: number;
  to: number;
  query: string;
}

interface HashtagSuggestion {
  key: string;
  kind: 'tag' | 'reference' | 'both';
  detail?: string;
  score: number;
}

function currentHashtagToken(value: string, caret: number): HashtagToken | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)#([^\s#]*)$/.exec(before);
  if (!match || match[2].length === 0) return null;
  const after = value.slice(caret);
  const suffix = /^[^\s#]*/.exec(after)?.[0] ?? '';
  return {
    from: before.length - match[2].length - 1,
    to: caret + suffix.length,
    query: match[2].toLowerCase(),
  };
}

function scoreCandidate(key: string, detail: string | undefined, query: string): number | null {
  const keyLower = key.toLowerCase();
  const detailLower = detail?.toLowerCase() ?? '';
  if (keyLower === query) return 0;
  if (keyLower.startsWith(query)) return 1;
  if (keyLower.includes(query)) return 2;
  if (detailLower.includes(query)) return 3;
  return null;
}

export default function Toolbar() {
  const logout = useStore((s) => s.logout);
  const search = useStore((s) => s.search);
  const clearSearch = useStore((s) => s.clearSearch);
  const searchQuery = useStore((s) => s.searchQuery);
  const notes = useStore((s) => s.notes);
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
  const [hashtagToken, setHashtagToken] = useState<HashtagToken | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const hashtagSuggestions = useMemo(() => {
    if (!hashtagToken) return [];

    const byKey = new Map<string, HashtagSuggestion>();

    const addCandidate = (
      key: string,
      kind: 'tag' | 'reference',
      detail?: string,
    ) => {
      const score = scoreCandidate(key, detail, hashtagToken.query);
      if (score === null) return;

      const lookupKey = key.toLowerCase();
      const existing = byKey.get(lookupKey);
      if (existing) {
        byKey.set(lookupKey, {
          key: existing.key,
          kind: existing.kind === kind ? kind : 'both',
          detail: existing.detail ?? detail,
          score: Math.min(existing.score, score),
        });
        return;
      }

      byKey.set(lookupKey, { key, kind, detail, score });
    };

    for (const note of notes) {
      for (const tag of note.tags) addCandidate(tag, 'tag');
      for (const ref of note.references) addCandidate(ref.key, 'reference', ref.text);
    }

    return [...byKey.values()]
      .sort((a, b) => (
        a.score - b.score ||
        a.key.localeCompare(b.key)
      ))
      .slice(0, MAX_HASHTAG_SUGGESTIONS);
  }, [hashtagToken, notes]);

  const updateHashtagToken = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const token = currentHashtagToken(input.value, input.selectionStart ?? input.value.length);
    setHashtagToken(token);
    setSelectedSuggestion(0);
  }, []);

  const runSearch = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const query = value.trim();
      if (query === '') {
        clearSearch();
        return;
      }

      timerRef.current = setTimeout(() => {
        void search(query);
      }, DEBOUNCE_MS);
    },
    [search, clearSearch],
  );

  const applyHashtagSuggestion = useCallback(
    (suggestion: HashtagSuggestion) => {
      const input = inputRef.current;
      if (!input || !hashtagToken) return;

      const replacement = `#${suggestion.key}`;
      const value =
        input.value.slice(0, hashtagToken.from) +
        replacement +
        input.value.slice(hashtagToken.to);
      const caret = hashtagToken.from + replacement.length;

      input.value = value;
      input.setSelectionRange(caret, caret);
      setHashtagToken(null);
      setSelectedSuggestion(0);
      runSearch(value);
      input.focus();
    },
    [hashtagToken, runSearch],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const token = currentHashtagToken(value, e.target.selectionStart ?? value.length);
      setHashtagToken(token);
      setSelectedSuggestion(0);
      runSearch(value);
    },
    [runSearch],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
      updateHashtagToken();
    },
    [updateHashtagToken],
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
      if (hashtagSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestion((idx) => (idx + 1) % hashtagSuggestions.length);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestion((idx) =>
            (idx - 1 + hashtagSuggestions.length) % hashtagSuggestions.length,
          );
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          applyHashtagSuggestion(hashtagSuggestions[selectedSuggestion]);
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          applyHashtagSuggestion(hashtagSuggestions[selectedSuggestion]);
          return;
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const noteList = document.getElementById('note-list');
        if (noteList) {
          noteList.focus();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (hashtagToken) {
          setHashtagToken(null);
          return;
        }
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
          void createNote(query);
        }
      }
    },
    [
      applyHashtagSuggestion,
      clearSearch,
      createNote,
      hashtagSuggestions,
      hashtagToken,
      searchResults,
      selectedSuggestion,
    ],
  );

  const hasVisibleSuggestions = hashtagToken && hashtagSuggestions.length > 0;

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
      <div
        style={{
          flex: 1,
          position: 'relative',
          minWidth: 0,
        }}
      >
        <input
          id="search-input"
          ref={inputRef}
          type="text"
          placeholder="Search... (Esc / Cmd+L)"
          defaultValue={searchQuery}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onClick={updateHashtagToken}
          onKeyUp={handleKeyUp}
          onBlur={() => setTimeout(() => setHashtagToken(null), 100)}
          autoComplete="off"
          style={{
            width: '100%',
            boxSizing: 'border-box',
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
        {hasVisibleSuggestions && (
          <div
            role="listbox"
            aria-label="Search hashtag suggestions"
            style={{
              position: 'absolute',
              top: 'calc(100% + 2px)',
              left: 0,
              right: 0,
              zIndex: 50,
              border: '1px solid var(--border)',
              background: 'var(--bg-editor)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            {hashtagSuggestions.map((suggestion, idx) => (
              <button
                key={`${suggestion.kind}:${suggestion.key}`}
                type="button"
                role="option"
                aria-selected={idx === selectedSuggestion}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyHashtagSuggestion(suggestion);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, max-content) auto max-content',
                  gap: '10px',
                  alignItems: 'baseline',
                  width: '100%',
                  padding: '5px 8px',
                  border: 'none',
                  background: idx === selectedSuggestion ? 'var(--bg-selected)' : 'transparent',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                }}
              >
                <span>#{suggestion.key}</span>
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {suggestion.detail ?? ''}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                  {suggestion.kind}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
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
