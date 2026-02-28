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
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {notes.map((note) => (
        <div
          key={note.id}
          onClick={() => selectNote(note.id)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
            background: note.id === selectedId ? 'var(--bg-selected)' : 'transparent',
            borderBottom: '1px solid var(--border)',
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
