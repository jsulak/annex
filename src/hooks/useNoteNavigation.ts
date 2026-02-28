import { useEffect } from 'react';
import { useStore } from '../store/useStore.js';

export function useNoteNavigation() {
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);
  const setQuickOpenVisible = useStore((s) => s.setQuickOpenVisible);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+[ — go back
      if (e.key === '[') {
        e.preventDefault();
        goBack();
        return;
      }

      // Cmd+] — go forward
      if (e.key === ']') {
        e.preventDefault();
        goForward();
        return;
      }

      // Cmd+O — quick open
      if (e.key === 'o') {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goBack, goForward, setQuickOpenVisible]);
}
