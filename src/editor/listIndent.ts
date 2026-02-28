import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

// Matches list markers or blockquote prefixes:
//   - bullet:     "  - ", "* ", "+ "
//   - ordered:    "1. ", "2) "
//   - blockquote: "> ", ">> ", "> > "
const listLineRe = /^(\s*(?:[-*+]|\d+[.)]) )/;
const quoteLineRe = /^((?:>\s*)+)/;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const listMatch = listLineRe.exec(line.text);
      const quoteMatch = !listMatch ? quoteLineRe.exec(line.text) : null;
      const indent = listMatch ? listMatch[1].length : quoteMatch ? quoteMatch[1].length : 0;
      if (indent > 0) {
        const deco = Decoration.line({
          attributes: {
            style: `padding-left: ${indent}ch; text-indent: -${indent}ch;`,
          },
        });
        builder.add(line.from, line.from, deco);
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

const listIndentPlugin = ViewPlugin.define(
  (view) => ({
    decorations: buildDecorations(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
);

export const listIndent: Extension = listIndentPlugin;
