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

const wikiLinkDecorator = new MatchDecorator({
  regexp: /\[\[([^\]]+)\]\]/g,
  decoration: () => wikiLinkMark,
});

const wikiLinkPlugin = ViewPlugin.define(
  (view) => ({
    decorations: wikiLinkDecorator.createDeco(view),
    update(update: ViewUpdate) {
      this.decorations = wikiLinkDecorator.updateDeco(update, this.decorations);
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
);

const tagMark = Decoration.mark({ class: 'cm-tag' });

const tagDecorator = new MatchDecorator({
  regexp: /(?:^|\s)(#[a-zA-Z][\w-]*)/g,
  decorate: (add, from, _to, match) => {
    // Only decorate the captured #tag group, not the leading whitespace
    const offset = match[0].length - match[1].length;
    add(from + offset, from + offset + match[1].length, tagMark);
  },
});

const tagPlugin = ViewPlugin.define(
  (view) => ({
    decorations: tagDecorator.createDeco(view),
    update(update: ViewUpdate) {
      this.decorations = tagDecorator.updateDeco(update, this.decorations);
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

/** Extract the tag at a given position, if any. */
function tagAt(doc: string, pos: number): string | null {
  // Find the line containing pos
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = doc.indexOf('\n', pos);
  const line = doc.slice(lineStart, lineEnd === -1 ? doc.length : lineEnd);
  const posInLine = pos - lineStart;

  const re = /(?:^|\s)#([a-zA-Z][\w-]*)/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    // The # starts after the optional whitespace
    const hashPos = match[0].startsWith('#') ? match.index : match.index + 1;
    const tagEnd = hashPos + 1 + match[1].length;
    if (posInLine >= hashPos && posInLine < tagEnd) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

/**
 * Create a wiki-link + tag extension with click navigation.
 * `onNavigate` is called with the link target (note title or ID).
 * `onSearchTag` is called with the tag name (without #).
 */
export function wikiLinks(
  onNavigate: (target: string) => void,
  onSearchTag?: (tag: string) => void,
): Extension {
  const clickHandler = EditorView.domEventHandlers({
    click(event: MouseEvent, view: EditorView) {

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const doc = view.state.doc.toString();

      const wikiTarget = wikiLinkAt(doc, pos);
      if (wikiTarget) {
        event.preventDefault();
        onNavigate(wikiTarget);
        return true;
      }

      if (onSearchTag) {
        const tag = tagAt(doc, pos);
        if (tag) {
          event.preventDefault();
          onSearchTag(tag);
          return true;
        }
      }

      return false;
    },
  });

  return [wikiLinkPlugin, tagPlugin, clickHandler];
}
