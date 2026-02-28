import type { Extension } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { styleTags } from '@lezer/highlight';
import { zettelTheme, zettelHighlight, listMarkTag, quoteMarkTag } from './theme.js';
import { wikiLinks } from './wikilinks.js';
import { zettelAutocomplete, type CompletionProviders } from './autocomplete.js';
import { listIndent } from './listIndent.js';
import { linkDecorations } from './linkDecorations.js';

export interface EditorCallbacks {
  onUpdate: (content: string) => void;
  onNavigate: (target: string) => void;
  onSearchTag: (tag: string) => void;
  completionProviders: CompletionProviders;
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
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
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
