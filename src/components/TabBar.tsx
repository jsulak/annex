import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import type { Tab } from '../store/useStore.js';
import type { NoteIndex } from '../types.js';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

function getTabTitle(tab: Tab, notes: NoteIndex[]): string {
  if (tab.customTitle !== null) return tab.customTitle;
  if (tab.selectedId) {
    const note = notes.find((n) => n.id === tab.selectedId);
    if (note) return note.title || note.filename.replace(/\.md$/i, '').replace(/^\d{12,14}\s*/, '');
  }
  return 'New Tab';
}

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const notes = useStore((s) => s.notes);
  const addTab = useStore((s) => s.addTab);
  const closeTab = useStore((s) => s.closeTab);
  const switchTab = useStore((s) => s.switchTab);
  const reorderTabs = useStore((s) => s.reorderTabs);
  const renameTab = useStore((s) => s.renameTab);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(
    (tab: Tab) => {
      setEditingTabId(tab.id);
      setEditingTitle(getTabTitle(tab, notes));
      setTimeout(() => editInputRef.current?.select(), 0);
    },
    [notes],
  );

  const commitEdit = useCallback(() => {
    if (!editingTabId) return;
    const trimmed = editingTitle.trim();
    renameTab(editingTabId, trimmed.length > 0 ? trimmed : null);
    setEditingTabId(null);
  }, [editingTabId, editingTitle, renameTab]);

  const cancelEdit = useCallback(() => setEditingTabId(null), []);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTabId(tabId);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toTabId: string) => {
      e.preventDefault();
      if (!draggedTabId || draggedTabId === toTabId) {
        setDraggedTabId(null);
        setDragOverTabId(null);
        return;
      }
      const fromIndex = tabs.findIndex((t) => t.id === draggedTabId);
      const toIndex = tabs.findIndex((t) => t.id === toTabId);
      if (fromIndex !== -1 && toIndex !== -1) reorderTabs(fromIndex, toIndex);
      setDraggedTabId(null);
      setDragOverTabId(null);
    },
    [draggedTabId, tabs, reorderTabs],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 34,
        background: 'var(--bg-list)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        scrollbarWidth: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDragOver = tab.id === dragOverTabId && tab.id !== draggedTabId;
        const isEditing = editingTabId === tab.id;
        const title = getTabTitle(tab, notes);

        return (
          <div
            key={tab.id}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDrop={(e) => handleDrop(e, tab.id)}
            onDragEnd={handleDragEnd}
            onClick={() => !isActive && switchTab(tab.id)}
            onDoubleClick={() => !isEditing && startEditing(tab)}
            title={isEditing ? undefined : title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 6px 0 10px',
              minWidth: 90,
              maxWidth: 200,
              flexShrink: 0,
              cursor: isActive ? 'default' : 'pointer',
              background: isActive
                ? 'var(--bg-editor)'
                : isDragOver
                  ? 'var(--bg-selected)'
                  : 'transparent',
              borderRight: '1px solid var(--border)',
              borderTop: isActive ? '2px solid var(--text-accent)' : '2px solid transparent',
              opacity: draggedTabId === tab.id ? 0.4 : 1,
            }}
          >
            {isEditing ? (
              <input
                ref={editInputRef}
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: '1px solid var(--text-accent)',
                  outlineOffset: 1,
                  borderRadius: 2,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  padding: '1px 2px',
                }}
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {title}
              </span>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              title="Close tab"
              style={{
                flexShrink: 0,
                width: 16,
                height: 16,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 15,
                lineHeight: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                padding: 0,
                opacity: isActive ? 0.7 : 0.4,
              }}
              onMouseOver={(e) => { (e.currentTarget.style.opacity = '1'); (e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 15%, transparent)'); }}
              onMouseOut={(e) => { (e.currentTarget.style.opacity = isActive ? '0.7' : '0.4'); (e.currentTarget.style.background = 'transparent'); }}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* New tab button */}
      <button
        onClick={addTab}
        title={`New tab (${mod}T)`}
        style={{
          flexShrink: 0,
          width: 32,
          height: '100%',
          border: 'none',
          borderRight: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        +
      </button>

      {/* Filler to push tabs left */}
      <div style={{ flex: 1 }} />
    </div>
  );
}
