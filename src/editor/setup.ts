import type { Extension } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { zettelTheme } from './theme.js';

export function createExtensions(
  onUpdate: (content: string) => void,
): Extension[] {
  return [
    markdown({ codeLanguages: languages }),
    zettelTheme,
    EditorView.lineWrapping,
    history(),
    closeBrackets(),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
    placeholder('Start writing...'),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onUpdate(update.state.doc.toString());
      }
    }),
  ];
}
