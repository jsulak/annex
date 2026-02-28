import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import { apiFetch } from '../api/client.js';

interface TagEntry {
  tag: string;
  count: number;
}

export default function TagsModal() {
  const setTagsModalVisible = useStore((s) => s.setTagsModalVisible);
  const search = useStore((s) => s.search);

  const [tags, setTags] = useState<TagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? tags.filter((t) => t.tag.toLowerCase().includes(query.toLowerCase()))
    : tags;

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTagsModalVisible(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setTagsModalVisible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/v1/tags');
        if (res.ok && !cancelled) {
          setTags(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset selection when filter changes
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
    setTagsModalVisible(false);
  }, [setTagsModalVisible]);

  const handleSelect = useCallback(
    (tag: string) => {
      search(`#${tag}`);
      close();
    },
    [search, close],
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
          handleSelect(filtered[selectedIndex].tag);
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
          width: '400px',
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
          placeholder="Filter tags..."
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
          {loading && (
            <div
              style={{
                padding: '12px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
              }}
            >
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div
              style={{
                padding: '12px',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
              }}
            >
              No matching tags
            </div>
          )}
          {filtered.map((entry, i) => (
            <div
              key={entry.tag}
              onClick={() => handleSelect(entry.tag)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                background:
                  i === selectedIndex ? 'var(--bg-selected)' : 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              <span>#{entry.tag}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{entry.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
