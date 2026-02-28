import { useStore } from '../store/useStore.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import type { SaveStatus } from '../hooks/useAutoSave.js';
import CodeMirrorEditor from './CodeMirrorEditor.js';

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 12,
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    pointerEvents: 'none',
    zIndex: 10,
  };

  switch (status) {
    case 'dirty':
      return <span style={{ ...style, color: 'var(--text-accent)' }}>&bull;</span>;
    case 'saving':
      return <span style={{ ...style, color: 'var(--text-secondary)' }}>Saving...</span>;
    case 'saved':
      return <span style={{ ...style, color: 'var(--text-secondary)' }}>Saved</span>;
    case 'error':
      return <span style={{ ...style, color: 'var(--danger)' }}>Save failed</span>;
  }
}

export default function EditorPane() {
  const selectedNote = useStore((s) => s.selectedNote);
  const selectedId = useStore((s) => s.selectedId);
  const { handleChange, saveNow, saveStatus } = useAutoSave(
    selectedId,
    selectedNote?.etag ?? null,
  );

  if (!selectedId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        }}
      >
        Select a note
      </div>
    );
  }

  if (!selectedNote) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <SaveIndicator status={saveStatus} />
      <CodeMirrorEditor
        doc={selectedNote.body}
        onUpdate={handleChange}
        saveNow={saveNow}
      />
    </div>
  );
}
