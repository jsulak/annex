import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { useStore } from '../store/useStore.js';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

const AUTO_SAVE_DELAY = 1000;
const SAVED_DISPLAY_DURATION = 1500;

export function useAutoSave(
  noteId: string | null,
  etag: string | null,
): {
  handleChange: (content: string) => void;
  saveNow: () => Promise<void>;
  cancelPending: () => void;
  saveStatus: SaveStatus;
} {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const pendingContentRef = useRef<string | null>(null);
  const currentNoteIdRef = useRef<string | null>(noteId);
  const currentEtagRef = useRef<string | null>(etag);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  // Keep etag ref in sync
  currentEtagRef.current = etag;

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, []);

  const doSave = useCallback(async (id: string, content: string, currentEtag: string | null) => {
    if (isSavingRef.current) return;

    // Don't save notes that are being deleted or already deleted
    const state = useStore.getState();
    if (state.pendingDeleteId === id || !state.notes.some((n) => n.id === id)) {
      pendingContentRef.current = null;
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');
    clearSavedTimer();

    try {
      const headers: Record<string, string> = {};
      if (currentEtag) {
        headers['If-Match'] = currentEtag;
      }

      const res = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ body: content }),
      });

      if (res.ok) {
        const data = await res.json();
        useStore.getState().updateEtag(data.etag);
        useStore.getState().updateNoteInList(id, data.modifiedAt, data.title, data.snippet, data.tags, data.links);
        useStore.getState().setHasPendingEdits(false);
        pendingContentRef.current = null;
        setSaveStatus('saved');

        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, SAVED_DISPLAY_DURATION);
      } else if (res.status === 409) {
        // Conflict — fetch current server version and surface dialog
        try {
          const serverRes = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
          if (serverRes.ok) {
            const serverNote = await serverRes.json();
            useStore.getState().setConflict({
              noteId: id,
              localBody: content,
              serverBody: serverNote.body,
              serverEtag: serverNote.etag,
            });
          }
        } catch {
          // If we can't fetch server version, fall through to generic error
        }
        pendingContentRef.current = null;
        setSaveStatus('conflict');
      } else {
        console.error('Save failed:', res.status, res.statusText);
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [clearSavedTimer]);

  const flushSave = useCallback(async (id: string | null) => {
    clearDebounce();
    if (id && pendingContentRef.current !== null) {
      await doSave(id, pendingContentRef.current, currentEtagRef.current);
    }
  }, [clearDebounce, doSave]);

  const saveNow = useCallback(async () => {
    await flushSave(currentNoteIdRef.current);
  }, [flushSave]);

  const handleChange = useCallback((content: string) => {
    pendingContentRef.current = content;
    useStore.getState().setHasPendingEdits(true, content);
    setSaveStatus('dirty');
    clearSavedTimer();
    clearDebounce();

    debounceTimerRef.current = setTimeout(() => {
      const id = currentNoteIdRef.current;
      if (id && pendingContentRef.current !== null) {
        void doSave(id, pendingContentRef.current, currentEtagRef.current);
      }
    }, AUTO_SAVE_DELAY);
  }, [clearDebounce, clearSavedTimer, doSave]);

  // Flush on note switch
  useEffect(() => {
    const prevId = currentNoteIdRef.current;

    if (prevId !== noteId && prevId) {
      // Flush save for previous note
      void flushSave(prevId);
    }

    currentNoteIdRef.current = noteId;
    pendingContentRef.current = null;
    useStore.getState().setHasPendingEdits(false);
    setSaveStatus('idle');
    clearSavedTimer();
  }, [noteId, flushSave, clearSavedTimer]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      clearDebounce();
      clearSavedTimer();
      const id = currentNoteIdRef.current;
      if (id && pendingContentRef.current !== null) {
        // Fire-and-forget save on unmount
        void doSave(id, pendingContentRef.current, currentEtagRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelPending = useCallback(() => {
    clearDebounce();
    pendingContentRef.current = null;
    useStore.getState().setHasPendingEdits(false);
    setSaveStatus('idle');
  }, [clearDebounce]);

  return { handleChange, saveNow, cancelPending, saveStatus };
}
