import { create } from 'zustand';
import { apiFetch } from '../api/client.js';
import type { NoteIndex, NoteDetail } from '../types.js';

interface AppState {
  notes: NoteIndex[];
  selectedId: string | null;
  selectedNote: NoteDetail | null;
  loading: boolean;
  fetchNotes: () => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  notes: [],
  selectedId: null,
  selectedNote: null,
  loading: false,

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

  logout: async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.href = '/';
  },
}));
