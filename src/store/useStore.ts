import { create } from 'zustand';
import { apiFetch } from '../api/client.js';
import type { NoteIndex, NoteDetail, SearchResult } from '../types.js';

function generateId(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12);
}

export interface AppSettings {
  autoSaveDelay: number;
  showSnippets: boolean;
  editorWidth: number;
  fontSize: number;
  noteTemplate: string;
  indexExtensions: string[];
  darkMode: 'auto' | 'light' | 'dark';
  lineHeight: number;
}

function applySettingsToDOM(settings: AppSettings) {
  document.documentElement.style.setProperty('--font-size-editor', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--line-height-editor', `${settings.lineHeight ?? 1.6}`);
}

interface ConflictInfo {
  noteId: string;
  localBody: string;
  serverBody: string;
  serverEtag: string;
}

interface AppState {
  notes: NoteIndex[];
  selectedId: string | null;
  selectedNote: NoteDetail | null;
  loading: boolean;
  searchQuery: string;
  searchResults: SearchResult[] | null;
  searchLoading: boolean;
  history: string[];
  historyIndex: number;
  quickOpenVisible: boolean;
  tagsModalVisible: boolean;
  backlinksVisible: boolean;
  settingsVisible: boolean;
  keyboardHelpVisible: boolean;
  _navigatingHistory: boolean;
  conflict: ConflictInfo | null;
  hasPendingEdits: boolean;
  pendingBody: string | null;
  pendingDeleteId: string | null;
  appSettings: AppSettings | null;
  fetchSettings: () => Promise<void>;
  setAppSettings: (settings: AppSettings) => void;
  fetchNotes: () => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  deselectNote: () => void;
  updateEtag: (etag: string) => void;
  updateNoteInList: (id: string, modifiedAt: string, title: string, snippet: string, tags: string[], links: string[]) => void;
  renameNoteInList: (id: string, filename: string, title: string) => void;
  createNote: (title?: string) => Promise<void>;
  deleteNote: (id: string) => Promise<boolean>;
  upsertNoteFromSSE: (id: string) => Promise<void>;
  removeNoteFromSSE: (id: string) => void;
  reloadSelectedNote: (id: string) => Promise<void>;
  setConflict: (conflict: ConflictInfo | null) => void;
  setHasPendingEdits: (value: boolean, body?: string | null) => void;
  resolveConflict: (choice: 'local' | 'server') => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  logout: () => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  setQuickOpenVisible: (visible: boolean) => void;
  setTagsModalVisible: (visible: boolean) => void;
  setBacklinksVisible: (visible: boolean) => void;
  toggleBacklinks: () => void;
  setSettingsVisible: (visible: boolean) => void;
  setKeyboardHelpVisible: (visible: boolean) => void;
  newNoteDialogVisible: boolean;
  setNewNoteDialogVisible: (visible: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  notes: [],
  selectedId: null,
  selectedNote: null,
  loading: false,
  searchQuery: '',
  searchResults: null,
  searchLoading: false,
  history: [],
  historyIndex: -1,
  quickOpenVisible: false,
  tagsModalVisible: false,
  backlinksVisible: false,
  settingsVisible: false,
  keyboardHelpVisible: false,
  newNoteDialogVisible: false,
  _navigatingHistory: false,
  conflict: null,
  hasPendingEdits: false,
  pendingBody: null,
  pendingDeleteId: null,
  appSettings: null,

  fetchSettings: async () => {
    try {
      const res = await apiFetch('/api/v1/config');
      if (res.ok) {
        const data = await res.json();
        set({ appSettings: data.settings });
        applySettingsToDOM(data.settings);
      }
    } catch {
      // Use defaults if fetch fails
    }
  },

  setAppSettings: (settings: AppSettings) => {
    set({ appSettings: settings });
    applySettingsToDOM(settings);
  },

  fetchNotes: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch('/api/v1/notes');
      if (res.ok) {
        const notes: NoteIndex[] = await res.json();
        set({ notes });
      }
    } finally {
      set({ loading: false });
    }
  },

  selectNote: async (id: string) => {
    set({ selectedId: id, selectedNote: null });
    try {
      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
      if (res.ok) {
        const note: NoteDetail = await res.json();
        const { _navigatingHistory, history, historyIndex } = get();
        if (_navigatingHistory) {
          // Browser history was already updated by popstate handler — just replace state
          window.history.replaceState({ noteId: id }, '', `/note/${id}`);
          set({ selectedNote: note, _navigatingHistory: false });
        } else {
          // Skip push if already at this ID
          if (history[historyIndex] === id) {
            set({ selectedNote: note });
          } else {
            // Truncate any forward entries and push
            const newHistory = [...history.slice(0, historyIndex + 1), id];
            set({
              selectedNote: note,
              history: newHistory,
              historyIndex: newHistory.length - 1,
            });
          }
          // Push to browser history
          window.history.pushState({ noteId: id }, '', `/note/${id}`);
        }
      }
    } catch {
      set({ selectedId: null });
    }
  },

  deselectNote: () => {
    set({ selectedId: null, selectedNote: null });
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  },

  updateEtag: (etag: string) =>
    set((s) => ({
      selectedNote: s.selectedNote ? { ...s.selectedNote, etag } : null,
    })),

  updateNoteInList: (id, modifiedAt, title, snippet, tags, links) =>
    set((s) => {
      const idx = s.notes.findIndex((n) => n.id === id);
      if (idx < 0) return s;
      const notes = [...s.notes];
      notes[idx] = { ...notes[idx], modifiedAt, title, snippet, tags, links };
      // Re-sort by last modified so edited note moves to top
      notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      return { notes };
    }),

  renameNoteInList: (id, filename, title) =>
    set((s) => {
      const idx = s.notes.findIndex((n) => n.id === id);
      if (idx < 0) return s;
      const notes = [...s.notes];
      notes[idx] = { ...notes[idx], filename, title };
      return { notes };
    }),

  createNote: async (title?: string) => {
    const id = generateId();
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const body = title ? `Title:\t\t${title}\nDate:\t\t${dateStr}\nKeywords:\t\n\n\n\n\nBacklinks: [[${id}]]\n` : '';
    const filename = title ? `${id} ${title}.md` : undefined;
    const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ body, filename }),
    });

    if (res.ok) {
      const note: NoteDetail = await res.json();
      const { body: _, etag: __, ...noteIndex } = note;
      const { history, historyIndex } = get();
      const newHistory = [...history.slice(0, historyIndex + 1), note.id];
      set((s) => ({
        notes: [noteIndex as NoteIndex, ...s.notes],
        selectedId: note.id,
        selectedNote: note,
        searchQuery: '',
        searchResults: null,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }));
    }
  },

  deleteNote: async (id: string) => {
    // Mark as pending delete immediately so auto-save won't recreate the file
    set({ pendingDeleteId: id });

    try {
      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedNote: s.selectedId === id ? null : s.selectedNote,
          pendingDeleteId: null,
        }));
        return true;
      }
      set({ pendingDeleteId: null });
      return false;
    } catch {
      set({ pendingDeleteId: null });
      return false;
    }
  },

  upsertNoteFromSSE: async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
      if (res.ok) {
        const detail: NoteDetail = await res.json();
        const { body: _, etag: __, ...noteIndex } = detail;
        set((s) => {
          const existing = s.notes.findIndex((n) => n.id === id);
          let notes: NoteIndex[];
          if (existing >= 0) {
            notes = [...s.notes];
            notes[existing] = noteIndex as NoteIndex;
          } else {
            notes = [...s.notes, noteIndex as NoteIndex];
          }
          notes.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
          return { notes };
        });
      }
    } catch {
      // Ignore fetch errors from SSE updates
    }
  },

  removeNoteFromSSE: (id: string) => {
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedNote: s.selectedId === id ? null : s.selectedNote,
    }));
  },

  reloadSelectedNote: async (id: string) => {
    const { selectedId, hasPendingEdits } = get();
    if (selectedId !== id) return;
    try {
      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
      if (res.ok) {
        const note: NoteDetail = await res.json();
        if (hasPendingEdits) {
          const { pendingBody, selectedNote } = get();
          get().setConflict({
            noteId: id,
            localBody: pendingBody ?? selectedNote?.body ?? '',
            serverBody: note.body,
            serverEtag: note.etag,
          });
        } else {
          set({ selectedNote: note });
        }
      }
    } catch {
      // Ignore fetch errors
    }
  },

  setConflict: (conflict: ConflictInfo | null) => set({ conflict }),

  setHasPendingEdits: (value: boolean, body?: string | null) =>
    set({ hasPendingEdits: value, pendingBody: value ? (body ?? get().pendingBody) : null }),

  resolveConflict: async (choice: 'local' | 'server') => {
    const { conflict } = get();
    if (!conflict) return;

    if (choice === 'local') {
      // Force-PUT the user's version (no If-Match)
      try {
        const res = await apiFetch(
          `/api/v1/notes/${encodeURIComponent(conflict.noteId)}`,
          { method: 'PUT', body: JSON.stringify({ body: conflict.localBody }) },
        );
        if (res.ok) {
          const data = await res.json();
          set((s) => ({
            conflict: null,
            hasPendingEdits: false,
            selectedNote: s.selectedNote
              ? { ...s.selectedNote, body: conflict.localBody, etag: data.etag }
              : null,
          }));
        }
      } catch {
        // Keep conflict open on network error
      }
    } else {
      // Accept server version
      set((s) => ({
        conflict: null,
        hasPendingEdits: false,
        selectedNote: s.selectedNote
          ? { ...s.selectedNote, body: conflict.serverBody, etag: conflict.serverEtag }
          : null,
      }));
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query, searchLoading: true, selectedId: null, selectedNote: null });
    try {
      const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const results: SearchResult[] = await res.json();
        set({ searchResults: results });
      }
    } catch {
      set({ searchResults: null });
    } finally {
      set({ searchLoading: false });
    }
  },

  clearSearch: () =>
    set({ searchQuery: '', searchResults: null, searchLoading: false }),

  logout: async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.href = '/';
  },

  goBack: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({ historyIndex: newIndex, _navigatingHistory: true });
      get().selectNote(history[newIndex]);
    }
  },

  goForward: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      set({ historyIndex: newIndex, _navigatingHistory: true });
      get().selectNote(history[newIndex]);
    }
  },

  canGoBack: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  canGoForward: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  setQuickOpenVisible: (visible: boolean) => set({ quickOpenVisible: visible }),
  setTagsModalVisible: (visible: boolean) => set({ tagsModalVisible: visible }),
  setBacklinksVisible: (visible: boolean) => set({ backlinksVisible: visible }),
  toggleBacklinks: () => set((s) => ({ backlinksVisible: !s.backlinksVisible })),
  setSettingsVisible: (visible: boolean) => set({ settingsVisible: visible }),
  setKeyboardHelpVisible: (visible: boolean) => set({ keyboardHelpVisible: visible }),
  setNewNoteDialogVisible: (visible: boolean) => set({ newNoteDialogVisible: visible }),
}));
