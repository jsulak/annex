import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import { useSSE } from '../hooks/useSSE.js';
import Toolbar from './Toolbar.js';
import NoteList from './NoteList.js';
import EditorPane from './EditorPane.js';

const STORAGE_KEY = 'zettelweb-panel-width';
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 160;
const MAX_WIDTH = 600;

function getSavedWidth(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

export default function AppLayout() {
  const fetchNotes = useStore((s) => s.fetchNotes);
  const [panelWidth, setPanelWidth] = useState(getSavedWidth);
  useSSE();
  const dragging = useRef(false);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setPanelWidth(clamped);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)',
      }}
    >
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left panel — note list */}
        <div
          style={{
            width: panelWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-app)',
          }}
        >
          <NoteList />
        </div>

        {/* Resizable divider */}
        <div
          onMouseDown={onMouseDown}
          style={{
            width: '4px',
            cursor: 'col-resize',
            flexShrink: 0,
            background: 'transparent',
          }}
        />

        {/* Right panel — editor */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            minWidth: 0,
            background: 'var(--bg-editor)',
          }}
        >
          <EditorPane />
        </div>
      </div>
    </div>
  );
}
