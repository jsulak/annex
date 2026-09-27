import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { useStore } from '../store/useStore.js';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

const DEFAULT_AUTO_SAVE_DELAY = 1000;
const SAVED_DISPLAY_DURATION = 1500;

export function useAutoSave(
  noteId: string | null,
  etag: string | null,
  autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY,
): {
  handleChange: (content: string) => void;
  saveNow: () => Promise<void>;
  cancelPending: () => void;
  saveStatus: SaveStatus;
} {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const conflict = useStore((s) => s.conflict);

  const pendingContentRef = useRef<string | null>(null);
  const currentNoteIdRef = useRef<string | null>(noteId);
  const currentEtagRef = useRef<string | null>(etag);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const saveWaitersRef = useRef<Array<() => void>>([]);
  const failedRef = useRef(false);

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
    if (isSavingRef.current) {
      await new Promise<void>(resolve => saveWaitersRef.current.push(resolve));
      return;
    }

    const state = useStore.getState();
    if (state.conflict?.noteId === id) {
      pendingContentRef.current = null;
      setSaveStatus('conflict');
      return;
    }
    // Don't save notes that are being deleted or already deleted.
    if (state.pendingDeleteId === id || !state.notes.some((n) => n.id === id)) {
      pendingContentRef.current = null;
      return;
    }

    isSavingRef.current = true;
    failedRef.current = false;
    setSaveStatus('saving');
    clearSavedTimer();

    // A sync conflict or its resolution owns the buffer now. Check after each
    // response body is read too, since edits/resolution can happen during it.
    const wasSuperseded = () => {
      const latest = useStore.getState();
      return latest.conflict?.noteId === id
        || (latest.selectedId === id && latest.selectedNote !== state.selectedNote);
    };

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

      if (wasSuperseded()) return;

      if (res.ok) {
        const data = await res.json();
        if (wasSuperseded()) return;
        if (useStore.getState().selectedId === id) useStore.getState().updateEtag(data.etag);
        useStore.getState().updateNoteInList(
          id,
          data.modifiedAt,
          data.title,
          data.snippet,
          data.tags,
          data.links,
          data.references,
        );
        if (currentNoteIdRef.current !== id) return;
        currentEtagRef.current = data.etag;
        // Typing while a request is in flight must remain pending.
        if (pendingContentRef.current === content) {
          useStore.getState().setHasPendingEdits(false);
          pendingContentRef.current = null;
          setSaveStatus('saved');
        } else {
          setSaveStatus('dirty');
        }

        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, SAVED_DISPLAY_DURATION);
      } else if (res.status === 409) {
        failedRef.current = true;
        // Conflict — fetch current server version and surface dialog
        try {
          const serverRes = await apiFetch(`/api/v1/notes/${encodeURIComponent(id)}`);
          if (serverRes.ok) {
            const serverNote = await serverRes.json();
            if (wasSuperseded()) return;
            useStore.getState().setConflict({
              noteId: id,
              localBody: currentNoteIdRef.current === id ? pendingContentRef.current ?? content : content,
              serverBody: serverNote.body,
              serverEtag: serverNote.etag,
            });
            // The conflict dialog now owns this text and the user's resolution.
            if (currentNoteIdRef.current === id) pendingContentRef.current = null;
          }
        } catch {
          // If we can't fetch server version, fall through to generic error
        }
        setSaveStatus('conflict');
      } else {
        failedRef.current = true;
        console.error('Save failed:', res.status, res.statusText);
        setSaveStatus('error');
      }
    } catch (err) {
      failedRef.current = true;
      console.error('Save error:', err);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      for (const resolve of saveWaitersRef.current.splice(0)) resolve();
    }
  }, [clearSavedTimer]);

  const flushSave = useCallback(async (id: string | null) => {
    clearDebounce();
    while (id && pendingContentRef.current !== null) {
      await doSave(id, pendingContentRef.current, currentEtagRef.current);
      if (failedRef.current || currentNoteIdRef.current !== id) break;
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

    const currentConflict = useStore.getState().conflict;
    if (currentConflict?.noteId === currentNoteIdRef.current) {
      useStore.getState().setConflict({ ...currentConflict, localBody: content });
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      const id = currentNoteIdRef.current;
      if (id && pendingContentRef.current !== null) {
        void flushSave(id);
      }
    }, Math.max(200, autoSaveDelay));
  }, [autoSaveDelay, clearDebounce, clearSavedTimer, flushSave]);

  // The conflict dialog owns pending text until the user chooses a version.
  // Cancel the queued save so accepting the server version cannot save the
  // discarded local text afterward using the newly accepted etag.
  useEffect(() => {
    if (conflict?.noteId === noteId) {
      clearDebounce();
      clearSavedTimer();
      pendingContentRef.current = null;
      setSaveStatus('conflict');
    } else {
      setSaveStatus(prev => prev === 'conflict' ? 'idle' : prev);
    }
  }, [conflict, noteId, clearDebounce, clearSavedTimer]);

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
