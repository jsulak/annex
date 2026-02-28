import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const wikiLinkMark = Decoration.mark({ class: 'cm-wikilink' });

const decorator = new MatchDecorator({
  regexp: /\[\[([^\]]+)\]\]/g,
  decoration: () => wikiLinkMark,
});

const wikiLinkPlugin = ViewPlugin.define(
  (view) => ({
    decorations: decorator.createDeco(view),
    update(update: ViewUpdate) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
);

/** Extract the wiki-link target at a given position, if any. */
function wikiLinkAt(doc: string, pos: number): string | null {
  // Search backward for [[ and forward for ]]
  const before = doc.lastIndexOf('[[', pos);
  if (before === -1) return null;
  const after = doc.indexOf(']]', before + 2);
  if (after === -1 || pos > after + 1) return null;
  return doc.slice(before + 2, after).trim();
}

/**
 * Create a wiki-link extension with Cmd+Click navigation.
 * `onNavigate` is called with the link target (note title or ID).
 */
export function wikiLinks(onNavigate: (target: string) => void): Extension {
  const clickHandler = EditorView.domEventHandlers({
    click(event: MouseEvent, view: EditorView) {

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const doc = view.state.doc.toString();
      const target = wikiLinkAt(doc, pos);
      if (!target) return false;

      event.preventDefault();
      onNavigate(target);
      return true;
    },
  });

  return [wikiLinkPlugin, clickHandler];
}
