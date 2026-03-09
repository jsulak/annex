import type { Extension } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, insertTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { styleTags } from '@lezer/highlight';
import { zettelTheme, zettelHighlight, listMarkTag, quoteMarkTag } from './theme.js';
import { wikiLinks } from './wikilinks.js';
import { zettelAutocomplete, type CompletionProviders } from './autocomplete.js';
import { formattingKeymap } from './keymaps.js';
import { listIndent } from './listIndent.js';
import { linkDecorations } from './linkDecorations.js';

export interface EditorCallbacks {
  onUpdate: (content: string) => void;
  onNavigate: (target: string) => void;
  onSearchTag: (tag: string) => void;
  completionProviders: CompletionProviders;
}

// Matches a list marker with leading whitespace: "  - ", "* ", "1. ", etc.
const listLineRe = /^(\s*)([-*+]|\d+[.)]) /;

/** Indent level (number of leading spaces) of a list line, or -1 if not a list line. */
function listIndentLevel(text: string): number {
  const m = listLineRe.exec(text);
  return m ? m[1].length : -1;
}

/**
 * Smart Tab for lists: indent the current list item, but never more than
 * one level deeper than the item above it. On non-list lines, insert a tab.
 */
function smartListIndent(view: EditorView): boolean {
  const state = view.state;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const level = listIndentLevel(line.text);

  // Not a list line — insert a tab
  if (level === -1) return insertTab(view);

  // Find the nearest list line above
  let maxLevel = 0; // top-level if nothing above
  for (let ln = line.number - 1; ln >= 1; ln--) {
    const above = state.doc.line(ln);
    const aboveLevel = listIndentLevel(above.text);
    if (aboveLevel >= 0) {
      maxLevel = aboveLevel + 2; // one level deeper (2 spaces per level)
      break;
    }
    // Stop if we hit a blank line (separate list)
    if (above.text.trim() === '') break;
  }

  if (level >= maxLevel) return true; // already at max depth

  // Add 2 spaces of indentation
  const newIndent = Math.min(level + 2, maxLevel);
  const spacesToAdd = newIndent - level;
  view.dispatch({
    changes: { from: line.from, insert: ' '.repeat(spacesToAdd) },
  });
  return true;
}

export function createExtensions(callbacks: EditorCallbacks): Extension[] {
  return [
    markdown({
      codeLanguages: languages,
      extensions: [{
        props: [
          styleTags({
            ListMark: listMarkTag,
            QuoteMark: quoteMarkTag,
          }),
        ],
      }],
    }),
    zettelTheme,
    zettelHighlight,
    EditorView.lineWrapping,
    history(),
    closeBrackets(),
    formattingKeymap(),
    keymap.of([
      { key: 'Tab', run: smartListIndent },
      { key: 'Shift-Tab', run: indentLess },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    placeholder('Start writing...'),
    listIndent,
    wikiLinks(callbacks.onNavigate, callbacks.onSearchTag),
    linkDecorations(),
    zettelAutocomplete(callbacks.completionProviders),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        callbacks.onUpdate(update.state.doc.toString());
      }
    }),
  ];
}
