import type { Extension } from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';

export function saveKeymap(onSave: () => void): Extension {
  return keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        onSave();
        return true;
      },
    },
  ]);
}

/** Wrap selection with markers, or insert empty markers and place cursor inside. */
function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (from === to) {
    // No selection — insert markers and place cursor between them
    view.dispatch({
      changes: { from, to, insert: before + after },
      selection: { anchor: from + before.length },
    });
  } else {
    // Wrap selection
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
  }
  return true;
}

/** Insert a markdown link around selection, or empty link template. */
function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (from === to) {
    // No selection — insert [](url) and place cursor in the text part
    const template = '[](url)';
    view.dispatch({
      changes: { from, to, insert: template },
      selection: { anchor: from + 1 },
    });
  } else {
    // Wrap selection as link text
    const result = `[${selected}](url)`;
    // Place cursor on "url" so user can type the URL
    const urlStart = from + 1 + selected.length + 2; // [selected](
    view.dispatch({
      changes: { from, to, insert: result },
      selection: { anchor: urlStart, head: urlStart + 3 },
    });
  }
  return true;
}

export function formattingKeymap(): Extension {
  return keymap.of([
    { key: 'Mod-b', run: (view) => wrapSelection(view, '**', '**') },
    { key: 'Mod-i', run: (view) => wrapSelection(view, '*', '*') },
    { key: 'Mod-u', run: (view) => wrapSelection(view, '<u>', '</u>') },
    { key: 'Mod-k', run: (view) => insertLink(view) },
  ]);
}
