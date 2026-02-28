import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../store/useStore.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import type { SaveStatus } from '../hooks/useAutoSave.js';
import type { CompletionProviders } from '../editor/autocomplete.js';
import CodeMirrorEditor from './CodeMirrorEditor.js';
import Preview from './Preview.js';
import ConflictDialog from './ConflictDialog.js';
import BacklinksPanel from './BacklinksPanel.js';

type ViewMode = 'edit' | 'preview' | 'split';

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 70,
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
    case 'conflict':
      return <span style={{ ...style, color: 'var(--danger)' }}>Conflict</span>;
  }
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const modes: ViewMode[] = ['edit', 'preview', 'split'];
  const labels: Record<ViewMode, string> = {
    edit: 'Edit',
    preview: 'Preview',
    split: 'Split',
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '1px',
        position: 'absolute',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'var(--border)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}
    >
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            padding: '2px 8px',
            border: 'none',
            background: m === mode ? 'var(--bg-selected)' : 'var(--bg-app)',
            color: m === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {labels[m]}
        </button>
      ))}
    </div>
  );
}

export default function EditorPane() {
  const selectedNote = useStore((s) => s.selectedNote);
  const selectedId = useStore((s) => s.selectedId);
  const deleteNote = useStore((s) => s.deleteNote);
  const notes = useStore((s) => s.notes);
  const selectNote = useStore((s) => s.selectNote);
  const searchFn = useStore((s) => s.search);
  const conflict = useStore((s) => s.conflict);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  // Track live content for preview in split mode
  const [liveContent, setLiveContent] = useState<string>('');

  const { handleChange: autoSaveChange, saveNow, cancelPending, saveStatus } = useAutoSave(
    selectedId,
    selectedNote?.etag ?? null,
  );

  // Wrap handleChange to also update liveContent for split preview
  const handleChange = useCallback(
    (content: string) => {
      setLiveContent(content);
      autoSaveChange(content);
    },
    [autoSaveChange],
  );

  // Sync liveContent when note loads
  useEffect(() => {
    if (selectedNote) {
      setLiveContent(selectedNote.body);
    }
  }, [selectedNote]);

  // Navigate to a wiki-linked note by title or ID
  const handleNavigate = useCallback(
    (target: string) => {
      const lower = target.toLowerCase();
      const found = notes.find(
        (n) =>
          n.id === target ||
          n.title.toLowerCase() === lower ||
          n.filename.toLowerCase().includes(lower),
      );
      if (found) {
        selectNote(found.id);
      }
    },
    [notes, selectNote],
  );

  // Search by tag from preview
  const handleSearchTag = useCallback(
    (tag: string) => {
      searchFn(`#${tag}`);
    },
    [searchFn],
  );

  // Completion providers for [[ and # autocomplete
  const completionProviders: CompletionProviders = useMemo(
    () => ({
      getNotes: () =>
        useStore.getState().notes.map((n) => ({ id: n.id, title: n.title })),
      getTags: () => {
        const tagSet = new Set<string>();
        for (const n of useStore.getState().notes) {
          for (const t of n.tags) tagSet.add(t);
        }
        return [...tagSet].sort();
      },
    }),
    [],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedId || !selectedNote) return;
    const title = selectedNote.title || selectedNote.filename;
    if (!window.confirm(`Delete "${title}"? It will be moved to _trash/.`)) return;
    cancelPending();
    await deleteNote(selectedId);
  }, [selectedId, selectedNote, deleteNote, cancelPending]);

  // Cmd+P / Ctrl+P — cycle view mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'p' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setViewMode((prev) => {
          if (prev === 'edit') return 'preview';
          if (prev === 'preview') return 'split';
          return 'edit';
        });
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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

  const previewBody = viewMode === 'preview' ? selectedNote.body : liveContent;

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
      <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      {viewMode !== 'preview' && <SaveIndicator status={saveStatus} />}
      <button
        title="Delete note"
        onClick={handleDelete}
        style={{
          position: 'absolute',
          top: 6,
          right: 12,
          zIndex: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          padding: '2px 8px',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          background: 'var(--bg-app)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        Delete
      </button>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 28 }}>
        {/* Editor pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              minWidth: 0,
              borderRight: viewMode === 'split' ? '1px solid var(--border)' : undefined,
            }}
          >
            <CodeMirrorEditor
              doc={selectedNote.body}
              onUpdate={handleChange}
              saveNow={saveNow}
              onNavigate={handleNavigate}
              onSearchTag={handleSearchTag}
              completionProviders={completionProviders}
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'auto' }}>
            <Preview
              body={previewBody}
              onNavigate={handleNavigate}
              onSearchTag={handleSearchTag}
            />
          </div>
        )}
      </div>
      <BacklinksPanel selectedId={selectedId} />
      {conflict && <ConflictDialog />}
    </div>
  );
}
