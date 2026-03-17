import { useEffect } from 'react';
import { useStore } from '../store/useStore.js';

export function useNoteNavigation() {
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);
  const setQuickOpenVisible = useStore((s) => s.setQuickOpenVisible);
  const setTagsModalVisible = useStore((s) => s.setTagsModalVisible);
  const toggleBacklinks = useStore((s) => s.toggleBacklinks);
  const setSettingsVisible = useStore((s) => s.setSettingsVisible);
  const setKeyboardHelpVisible = useStore((s) => s.setKeyboardHelpVisible);
  const setNewNoteDialogVisible = useStore((s) => s.setNewNoteDialogVisible);
  const selectedId = useStore((s) => s.selectedId);
  const selectedNote = useStore((s) => s.selectedNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const addTab = useStore((s) => s.addTab);
  const closeTab = useStore((s) => s.closeTab);
  const prevTab = useStore((s) => s.prevTab);
  const nextTab = useStore((s) => s.nextTab);
  const switchTabByIndex = useStore((s) => s.switchTabByIndex);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+Backspace — delete note
      if (e.key === 'Backspace' && !e.shiftKey) {
        if (!selectedId || !selectedNote) return;
        e.preventDefault();
        const title = selectedNote.title || selectedNote.filename;
        if (window.confirm(`Delete "${title}"? It will be moved to _trash/.`)) {
          void deleteNote(selectedId);
        }
        return;
      }

      // Cmd+N — new note (Mac Cmd only, not Ctrl+N)
      if (e.key === 'n' && !e.shiftKey && e.metaKey) {
        e.preventDefault();
        setNewNoteDialogVisible(true);
        return;
      }

      // Cmd+Shift+[ — previous tab (e.key is '{' when shift is held on US keyboards)
      if (e.shiftKey && (e.key === '{' || e.code === 'BracketLeft')) {
        e.preventDefault();
        prevTab();
        return;
      }

      // Cmd+Shift+] — next tab
      if (e.shiftKey && (e.key === '}' || e.code === 'BracketRight')) {
        e.preventDefault();
        nextTab();
        return;
      }

      // Cmd+[ — go back (only without shift)
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault();
        goBack();
        return;
      }

      // Cmd+] — go forward (only without shift)
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault();
        goForward();
        return;
      }

      // Cmd+T — new tab
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        addTab();
        return;
      }

      // Cmd+W — close current tab
      if (e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        closeTab(useStore.getState().activeTabId);
        return;
      }

      // Cmd+1–9 — jump to tab by index
      if (!e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        switchTabByIndex(parseInt(e.key, 10) - 1);
        return;
      }

      // Cmd+O — quick open
      if (e.key === 'o') {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }

      // Cmd+Shift+K — tags modal
      if ((e.key === 'K' || e.key === 'k') && e.shiftKey) {
        e.preventDefault();
        setTagsModalVisible(true);
        return;
      }

      // Cmd+Shift+B — toggle backlinks
      if ((e.key === 'B' || e.key === 'b') && e.shiftKey) {
        e.preventDefault();
        toggleBacklinks();
        return;
      }

      // Cmd+, — settings
      if (e.key === ',') {
        e.preventDefault();
        setSettingsVisible(true);
        return;
      }
    };

    // ? to show keyboard help (only when not in input/editor)
    const helpHandler = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
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
      setKeyboardHelpVisible(true);
    };

    document.addEventListener('keydown', handler);
    document.addEventListener('keydown', helpHandler);
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('keydown', helpHandler);
    };
  }, [goBack, goForward, setQuickOpenVisible, setTagsModalVisible, toggleBacklinks, setSettingsVisible, setKeyboardHelpVisible, setNewNoteDialogVisible, selectedId, selectedNote, deleteNote, addTab, closeTab, prevTab, nextTab, switchTabByIndex]);
}
