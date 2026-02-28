import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createExtensions } from '../editor/setup.js';
import { saveKeymap } from '../editor/keymaps.js';

interface Props {
  doc: string;
  onUpdate: (content: string) => void;
  saveNow?: () => void;
}

export default function CodeMirrorEditor({ doc, onUpdate, saveNow }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  // Stable callback that delegates to the latest onUpdate ref
  const stableOnUpdate = useCallback((content: string) => {
    onUpdateRef.current(content);
  }, []);

  // Stable callback that delegates to the latest saveNow ref
  const stableSaveNow = useCallback(() => {
    saveNowRef.current?.();
  }, []);

  // Create editor view once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      ...createExtensions(stableOnUpdate),
      saveKeymap(stableSaveNow),
    ];

    const state = EditorState.create({
      doc,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Replace document when doc prop changes (note switch)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === doc) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: doc,
      },
      // Reset undo history on note switch
      effects: EditorView.scrollIntoView(0),
    });

    // Reset undo history by replacing the state's history
    // We create a fresh state with the new doc to reset history
    const newState = EditorState.create({
      doc,
      extensions: [
        ...createExtensions(stableOnUpdate),
        saveKeymap(stableSaveNow),
      ],
    });
    view.setState(newState);
  }, [doc, stableOnUpdate, stableSaveNow]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    />
  );
}
