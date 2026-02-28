import type { Extension } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { zettelTheme } from './theme.js';
import { wikiLinks } from './wikilinks.js';
import { zettelAutocomplete, type CompletionProviders } from './autocomplete.js';

export interface EditorCallbacks {
  onUpdate: (content: string) => void;
  onNavigate: (target: string) => void;
  completionProviders: CompletionProviders;
}

export function createExtensions(callbacks: EditorCallbacks): Extension[] {
  return [
    markdown({ codeLanguages: languages }),
    zettelTheme,
    EditorView.lineWrapping,
    history(),
    closeBrackets(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
    placeholder('Start writing...'),
    wikiLinks(callbacks.onNavigate),
    zettelAutocomplete(callbacks.completionProviders),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        callbacks.onUpdate(update.state.doc.toString());
      }
    }),
  ];
}
