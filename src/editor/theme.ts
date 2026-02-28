import { EditorView } from '@codemirror/view';

export const zettelTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-editor)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  '.cm-content': {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '16px',
    caretColor: 'var(--text-primary)',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text-primary)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--highlight)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
  },
  '.cm-activeLineGutter': {
    display: 'none',
  },
  '.cm-wikilink': {
    color: 'var(--text-accent)',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    cursor: 'pointer',
  },
  '.cm-tooltip-autocomplete': {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
});
