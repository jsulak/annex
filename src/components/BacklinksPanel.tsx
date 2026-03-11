import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { apiFetch } from '../api/client.js';
import type { NoteIndex } from '../types.js';

export default function BacklinksPanel({ selectedId }: { selectedId: string }) {
  const selectNote = useStore((s) => s.selectNote);
  const backlinksVisible = useStore((s) => s.backlinksVisible);
  const toggleBacklinks = useStore((s) => s.toggleBacklinks);

  const [backlinks, setBacklinks] = useState<NoteIndex[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/v1/notes/${encodeURIComponent(selectedId)}/backlinks`,
        );
        if (res.ok && !cancelled) {
          setBacklinks(await res.json());
        }
      } catch {
        if (!cancelled) setBacklinks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <div
        onClick={toggleBacklinks}
        style={{
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transform: backlinksVisible ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            fontSize: '10px',
          }}
        >
          &#9654;
        </span>
        Backlinks ({loading ? '...' : backlinks.length})
      </div>
      {backlinksVisible && (
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {loading && (
            <div
              style={{
                padding: '6px 12px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              Loading...
            </div>
          )}
          {!loading && backlinks.length === 0 && (
            <div
              style={{
                padding: '6px 12px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              No backlinks
            </div>
          )}
          {!loading &&
            backlinks.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note.id)}
                style={{
                  padding: '4px 12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                }}
              >
                <div style={{ color: 'var(--text-primary)' }}>
                  {note.title || note.id}
                </div>
                {note.snippet && (
                  <div
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {note.snippet}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
