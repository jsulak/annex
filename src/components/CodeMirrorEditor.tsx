import { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  createExtensions,
  editorDisplayExtensions,
  editorDisplaySettingsCompartment,
  setSearchTermsEffect,
  type EditorCallbacks,
  type UploadStatus,
} from '../editor/setup.js';
import { saveKeymap } from '../editor/keymaps.js';
import type { CompletionProviders } from '../editor/autocomplete.js';
import { parseSearchTerms } from '../utils/searchTerms.js';

interface Props {
  doc: string;
  onUpdate: (content: string) => void;
  saveNow?: () => void;
  onNavigate?: (target: string) => void;
  onSearchTag?: (tag: string) => void;
  completionProviders?: CompletionProviders;
  onUploadStatus?: (status: UploadStatus, message?: string) => void;
  insertRef?: React.MutableRefObject<((text: string) => void) | null>;
  focusRequest?: number;
  searchQuery?: string;
  hideMarkdownMarkup?: boolean;
}

export default function CodeMirrorEditor({
  doc,
  onUpdate,
  saveNow,
  onNavigate,
  onSearchTag,
  completionProviders,
  onUploadStatus,
  insertRef,
  focusRequest,
  searchQuery,
  hideMarkdownMarkup = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isSettingDocRef = useRef(false);
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
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

  const onUploadStatusRef = useRef(onUploadStatus);
  onUploadStatusRef.current = onUploadStatus;

  // Stable callback that delegates to the latest onUpdate ref
  // Suppressed during programmatic doc swaps to avoid false dirty/save
  const stableOnUpdate = useCallback((content: string) => {
    if (!isSettingDocRef.current) {
      onUpdateRef.current(content);
    }
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
  const stableProviders: CompletionProviders = useMemo(() => ({
    getNotes: () => completionProvidersRef.current?.getNotes() ?? [],
    getTags: () => completionProvidersRef.current?.getTags() ?? [],
    getReferences: () => completionProvidersRef.current?.getReferences() ?? [],
  }), []);

  const stableOnUploadStatus = useCallback((status: UploadStatus, message?: string) => {
    onUploadStatusRef.current?.(status, message);
  }, []);

  const buildCallbacks = useCallback((): EditorCallbacks => ({
    onUpdate: stableOnUpdate,
    onNavigate: stableOnNavigate,
    onSearchTag: stableOnSearchTag,
    completionProviders: stableProviders,
    onUploadStatus: stableOnUploadStatus,
  }), [stableOnUpdate, stableOnNavigate, stableOnSearchTag, stableProviders, stableOnUploadStatus]);

  const buildDisplayOptions = useCallback(() => ({
    hideMarkdownMarkup,
  }), [hideMarkdownMarkup]);

  // Create editor view once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      ...createExtensions(buildCallbacks(), buildDisplayOptions()),
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

    // Apply any active search highlights on mount
    const initialTerms = parseSearchTerms(searchQueryRef.current ?? '');
    if (initialTerms.length > 0) {
      view.dispatch({ effects: setSearchTermsEffect.of(initialTerms) });
    }

    if (insertRef) {
      insertRef.current = (text: string) => {
        const pos = view.state.selection.main.from;
        view.dispatch({ changes: { from: pos, to: pos, insert: text } });
        view.focus();
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (insertRef) insertRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  // Reconfigure display-only extensions without rebuilding editor state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorDisplaySettingsCompartment.reconfigure(
        editorDisplayExtensions(buildDisplayOptions()),
      ),
    });
  }, [buildDisplayOptions]);

  // Update search highlights when searchQuery changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const terms = parseSearchTerms(searchQuery ?? '');
    view.dispatch({ effects: setSearchTermsEffect.of(terms) });
  }, [searchQuery]);

  // Focus the editor when focusRequest increments (also fires on mount if already > 0)
  useEffect(() => {
    if (focusRequest && focusRequest > 0) {
      viewRef.current?.focus();
    }
  }, [focusRequest]);

  // The parent remounts us on note switches. Apply same-note updates as changes
  // so CodeMirror can map the selection and undo history through the edit.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === doc) return;

    // Keep unchanged text outside the replacement, including text containing
    // the cursor. Replacing the entire document would map most positions to 0.
    let from = 0;
    while (from < current.length && from < doc.length && current[from] === doc[from]) from++;
    let to = current.length;
    let insertTo = doc.length;
    while (to > from && insertTo > from && current[to - 1] === doc[insertTo - 1]) {
      to--;
      insertTo--;
    }

    isSettingDocRef.current = true;
    try {
      view.dispatch({
        changes: { from, to, insert: doc.slice(from, insertTo) },
        annotations: [Transaction.addToHistory.of(false), Transaction.remote.of(true)],
      });
    } finally {
      isSettingDocRef.current = false;
    }
  }, [doc]);

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
