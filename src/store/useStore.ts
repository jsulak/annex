import { create } from 'zustand';
import { apiFetch } from '../api/client.js';
import type { NoteIndex, NoteDetail, SearchResult } from '../types.js';

function generateId(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
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
  _navigatingHistory: boolean;
  fetchNotes: () => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  deselectNote: () => void;
  updateEtag: (etag: string) => void;
  createNote: (title?: string) => Promise<void>;
  deleteNote: (id: string) => Promise<boolean>;
  upsertNoteFromSSE: (id: string) => Promise<void>;
  removeNoteFromSSE: (id: string) => void;
  reloadSelectedNote: (id: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  logout: () => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  setQuickOpenVisible: (visible: boolean) => void;
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
  _navigatingHistory: false,

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
        }
      }
    } catch {
      set({ selectedId: null });
    }
  },

  deselectNote: () => set({ selectedId: null, selectedNote: null }),

  updateEtag: (etag: string) =>
    set((s) => ({
      selectedNote: s.selectedNote ? { ...s.selectedNote, etag } : null,
    })),

  createNote: async (title?: string) => {
    const id = generateId();
    const body = title ? `# ${title}\n\n` : '';
    const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
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
    const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      set((s) => ({
        notes: s.notes.filter((n) => n.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        selectedNote: s.selectedId === id ? null : s.selectedNote,
      }));
      return true;
    }
    return false;
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
    const { selectedId } = get();
    if (selectedId !== id) return;
    try {
      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
      if (res.ok) {
        const note: NoteDetail = await res.json();
        set({ selectedNote: note });
      }
    } catch {
      // Ignore fetch errors
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
}));
