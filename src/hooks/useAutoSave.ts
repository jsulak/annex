import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { useStore } from '../store/useStore.js';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const AUTO_SAVE_DELAY = 1000;
const SAVED_DISPLAY_DURATION = 1500;

export function useAutoSave(
  noteId: string | null,
  etag: string | null,
): {
  handleChange: (content: string) => void;
  saveNow: () => Promise<void>;
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
        pendingContentRef.current = null;
        setSaveStatus('saved');

        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, SAVED_DISPLAY_DURATION);
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
    setSaveStatus('dirty');
    clearSavedTimer();
    clearDebounce();

    debounceTimerRef.current = setTimeout(() => {
      const id = currentNoteIdRef.current;
      if (id && pendingContentRef.current !== null) {
        doSave(id, pendingContentRef.current, currentEtagRef.current);
      }
    }, AUTO_SAVE_DELAY);
  }, [clearDebounce, clearSavedTimer, doSave]);

  // Flush on note switch
  useEffect(() => {
    const prevId = currentNoteIdRef.current;

    if (prevId !== noteId && prevId) {
      // Flush save for previous note
      flushSave(prevId);
    }

    currentNoteIdRef.current = noteId;
    pendingContentRef.current = null;
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
        doSave(id, pendingContentRef.current, currentEtagRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { handleChange, saveNow, saveStatus };
}
