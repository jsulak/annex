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
  fetchNotes: () => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  deselectNote: () => void;
  updateEtag: (etag: string) => void;
  createNote: (title?: string) => Promise<void>;
  deleteNote: (id: string) => Promise<boolean>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  notes: [],
  selectedId: null,
  selectedNote: null,
  loading: false,
  searchQuery: '',
  searchResults: null,
  searchLoading: false,

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
        set({ selectedNote: note });
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
      set((s) => ({
        notes: [noteIndex as NoteIndex, ...s.notes],
        selectedId: note.id,
        selectedNote: note,
        searchQuery: '',
        searchResults: null,
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
}));
