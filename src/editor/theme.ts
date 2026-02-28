import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags, Tag } from '@lezer/highlight';

/** Custom tags for list/quote marks so they can be styled separately from other processingInstruction marks. */
export const listMarkTag = Tag.define();
export const quoteMarkTag = Tag.define();

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.4em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.2em' },
  { tag: tags.heading3, fontWeight: '700', fontSize: '1.1em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, class: 'cmt-link' },
  { tag: tags.url, class: 'cmt-url' },
  { tag: tags.monospace, class: 'cmt-monospace' },
  { tag: tags.quote, class: 'cmt-quote' },
  { tag: [tags.processingInstruction, tags.contentSeparator], class: 'cmt-meta' },
  { tag: listMarkTag, color: 'var(--text-secondary)' },
  { tag: quoteMarkTag, color: 'var(--text-secondary)' },
  { tag: tags.labelName, class: 'cmt-link' }, // reference-style link labels
]);

export const zettelHighlight = syntaxHighlighting(highlightStyle);

export const zettelTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-editor)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-editor, 13px)',
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
  '.cm-tag': {
    color: 'var(--text-accent)',
    cursor: 'pointer',
  },
  '.cm-tooltip-autocomplete': {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  '.cmt-link': {
    color: 'var(--text-accent)',
  },
  '.cmt-url': {
    color: 'var(--text-accent)',
    opacity: '0.7',
  },
  '.cmt-monospace': {
    background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
    borderRadius: '2px',
    padding: '0 2px',
  },
  '.cmt-quote': {
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  '.cmt-meta': {
    color: 'var(--text-secondary)',
    opacity: '0.45',
  },
});
