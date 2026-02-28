import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createExtensions, type EditorCallbacks } from '../editor/setup.js';
import { saveKeymap } from '../editor/keymaps.js';
import type { CompletionProviders } from '../editor/autocomplete.js';

interface Props {
  doc: string;
  onUpdate: (content: string) => void;
  saveNow?: () => void;
  onNavigate?: (target: string) => void;
  onSearchTag?: (tag: string) => void;
  completionProviders?: CompletionProviders;
}

export default function CodeMirrorEditor({
  doc,
  onUpdate,
  saveNow,
  onNavigate,
  onSearchTag,
  completionProviders,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const onSearchTagRef = useRef(onSearchTag);
  onSearchTagRef.current = onSearchTag;

  const completionProvidersRef = useRef(completionProviders);
  completionProvidersRef.current = completionProviders;

  // Stable callback that delegates to the latest onUpdate ref
  const stableOnUpdate = useCallback((content: string) => {
    onUpdateRef.current(content);
  }, []);

  // Stable callback that delegates to the latest saveNow ref
  const stableSaveNow = useCallback(() => {
    saveNowRef.current?.();
  }, []);

  // Stable callback that delegates to the latest onNavigate ref
  const stableOnNavigate = useCallback((target: string) => {
    onNavigateRef.current?.(target);
  }, []);

  // Stable callback that delegates to the latest onSearchTag ref
  const stableOnSearchTag = useCallback((tag: string) => {
    onSearchTagRef.current?.(tag);
  }, []);

  // Stable completion providers that delegate to the latest ref
  const stableProviders: CompletionProviders = {
    getNotes: () => completionProvidersRef.current?.getNotes() ?? [],
    getTags: () => completionProvidersRef.current?.getTags() ?? [],
  };

  const buildCallbacks = useCallback((): EditorCallbacks => ({
    onUpdate: stableOnUpdate,
    onNavigate: stableOnNavigate,
    onSearchTag: stableOnSearchTag,
    completionProviders: stableProviders,
  }), [stableOnUpdate, stableOnNavigate, stableOnSearchTag]);

  // Create editor view once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      ...createExtensions(buildCallbacks()),
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
      effects: EditorView.scrollIntoView(0),
    });

    // Reset undo history by replacing the state with fresh extensions
    const newState = EditorState.create({
      doc,
      extensions: [
        ...createExtensions(buildCallbacks()),
        saveKeymap(stableSaveNow),
      ],
    });
    view.setState(newState);
  }, [doc, buildCallbacks, stableSaveNow]);

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
