import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { clientId } from '../api/client.js';

export function useSSE() {
  const upsertNoteFromSSE = useStore((s) => s.upsertNoteFromSSE);
  const removeNoteFromSSE = useStore((s) => s.removeNoteFromSSE);
  const reloadSelectedNote = useStore((s) => s.reloadSelectedNote);
  const fetchNotes = useStore((s) => s.fetchNotes);

  const retryDelay = useRef(1000);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;

      es = new EventSource('/api/v1/events');

      es.addEventListener('connected', () => {
        retryDelay.current = 1000; // Reset backoff on successful connection
      });

      es.addEventListener('note:created', (e) => {
        const { id } = JSON.parse(e.data);
        void upsertNoteFromSSE(id);
      });

      es.addEventListener('note:modified', (e) => {
        const { id, etag, clientId: sourceClientId } = JSON.parse(e.data) as {
          id: string;
          etag?: string;
          clientId?: string;
        };
        void upsertNoteFromSSE(id);
        // Skip reload if this broadcast came from our own save — the PUT response
        // already updated our state, and reloading would trigger a false conflict.
        if (sourceClientId !== clientId) {
          void reloadSelectedNote(id, etag);
        }
      });

      es.addEventListener('note:deleted', (e) => {
        const { id } = JSON.parse(e.data);
        removeNoteFromSSE(id);
      });

      es.addEventListener('index:rebuilt', () => {
        void fetchNotes();
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
            connect();
          }, retryDelay.current);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [upsertNoteFromSSE, removeNoteFromSSE, reloadSelectedNote, fetchNotes]);
}
