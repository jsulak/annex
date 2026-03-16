import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { useAutoSave } from '../hooks/useAutoSave.js';
import type { SaveStatus } from '../hooks/useAutoSave.js';
import type { CompletionProviders } from '../editor/autocomplete.js';
import type { UploadStatus } from '../editor/setup.js';
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

function UploadIndicator({ status, message }: { status: UploadStatus; message?: string }) {
  if (status === 'idle') return null;
  const style: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 16,
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    pointerEvents: 'none',
    zIndex: 10,
  };
  if (status === 'uploading') return <span style={{ ...style, color: 'var(--text-secondary)' }}>Uploading...</span>;
  return <span style={{ ...style, color: 'var(--danger)' }}>{message ?? 'Upload failed'}</span>;
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
  const splitClass = (m: ViewMode) => m === 'split' ? 'view-mode-split' : '';

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
          className={splitClass(m)}
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
  const deselectNote = useStore((s) => s.deselectNote);
  const notes = useStore((s) => s.notes);
  const selectNote = useStore((s) => s.selectNote);
  const searchFn = useStore((s) => s.search);
  const conflict = useStore((s) => s.conflict);
  const searchQuery = useStore((s) => s.searchQuery);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState<string | undefined>();
  const uploadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertRef = useRef<((text: string) => void) | null>(null);
  const editorFocusRequest = useStore((s) => s.editorFocusRequest);
  // Track live content for preview in split mode
  const [liveContent, setLiveContent] = useState<string>('');

  const { handleChange: autoSaveChange, saveNow, saveStatus } = useAutoSave(
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

  // Track the body we've synced to avoid resetting on etag-only updates
  const syncedBodyRef = useRef<string | null>(null);
  const loadedNoteIdRef = useRef<string | null>(null);

  // Sync liveContent only on note switch or external body change (conflict resolution, SSE)
  useEffect(() => {
    if (selectedNote) {
      if (selectedNote.id !== loadedNoteIdRef.current) {
        // Different note selected — always sync
        setLiveContent(selectedNote.body);
        syncedBodyRef.current = selectedNote.body;
        loadedNoteIdRef.current = selectedNote.id;
      } else if (selectedNote.body !== syncedBodyRef.current) {
        // Same note, but body changed externally (conflict resolution, SSE reload)
        setLiveContent(selectedNote.body);
        syncedBodyRef.current = selectedNote.body;
      }
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
        void selectNote(found.id);
      }
    },
    [notes, selectNote],
  );

  // Search by tag from preview
  const handleSearchTag = useCallback(
    (tag: string) => {
      void searchFn(`#${tag}`);
    },
    [searchFn],
  );

  const handleUploadStatus = useCallback((status: UploadStatus, message?: string) => {
    if (uploadErrorTimerRef.current) clearTimeout(uploadErrorTimerRef.current);
    setUploadStatus(status);
    setUploadMessage(message);
    if (status === 'error') {
      uploadErrorTimerRef.current = setTimeout(() => setUploadStatus('idle'), 3000);
    }
  }, []);

  // Completion providers for [[ and # autocomplete
  const completionProviders: CompletionProviders = useMemo(
    () => ({
      getNotes: () =>
        useStore.getState().notes.map((n) => ({ id: n.id, title: n.title, filename: n.filename })),
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

  // Cmd+M / Ctrl+M — cycle view mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'm' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
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
    return <div style={{ flex: 1 }} />;
  }

  const previewBody = liveContent;

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
      <button
        className="mobile-back-btn"
        onClick={deselectNote}
        style={{
          display: 'none',
          position: 'absolute',
          top: 6,
          left: 12,
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
        &#x25C0; List
      </button>
      <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      {viewMode !== 'preview' && <SaveIndicator status={saveStatus} />}
      {viewMode !== 'preview' && (
        <UploadIndicator status={uploadStatus} message={uploadMessage} />
      )}

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
              doc={liveContent}
              onUpdate={handleChange}
              saveNow={saveNow}
              onNavigate={handleNavigate}
              onSearchTag={handleSearchTag}
              completionProviders={completionProviders}
              onUploadStatus={handleUploadStatus}
              insertRef={insertRef}
              focusRequest={editorFocusRequest}
              searchQuery={searchQuery}
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'auto' }}>
            <Preview
              body={previewBody}
              filename={selectedNote?.filename}
              onNavigate={handleNavigate}
              onSearchTag={handleSearchTag}
              searchQuery={searchQuery}
            />
          </div>
        )}
      </div>
      <BacklinksPanel selectedId={selectedId} />
      {conflict && <ConflictDialog />}
    </div>
  );
}
