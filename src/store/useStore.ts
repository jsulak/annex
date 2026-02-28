import { create } from 'zustand';
import { apiFetch } from '../api/client.js';
import type { NoteIndex, NoteDetail, SearchResult } from '../types.js';

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
  updateEtag: (etag: string) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
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

  updateEtag: (etag: string) =>
    set((s) => ({
      selectedNote: s.selectedNote ? { ...s.selectedNote, etag } : null,
    })),

  search: async (query: string) => {
    set({ searchQuery: query, searchLoading: true });
    try {
      const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const results: SearchResult[] = await res.json();
        set({ searchResults: results });
      }
    } catch {
      // On error, clear results
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
