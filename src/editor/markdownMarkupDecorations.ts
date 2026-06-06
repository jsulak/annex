import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

function selectionIntersects(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.from >= from && range.from <= to;
    return range.from <= to && range.to >= from;
  });
}

function addReplace(
  decos: Array<{ from: number; to: number; deco: Decoration }>,
  from: number,
  to: number,
) {
  if (from >= to) return;
  decos.push({ from, to, deco: Decoration.replace({}) });
}

function addInlineCodeDecorations(
  view: EditorView,
  decos: Array<{ from: number; to: number; deco: Decoration }>,
) {
  const inlineCodeRe = /(^|[^`])`([^`\n]+)`(?!`)/g;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    inlineCodeRe.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = inlineCodeRe.exec(text)) !== null) {
      const prefixLength = match[1].length;
      const codeFrom = from + match.index + prefixLength;
      const codeTo = codeFrom + match[0].length - prefixLength;
      if (selectionIntersects(view, codeFrom, codeTo)) continue;

      addReplace(decos, codeFrom, codeFrom + 1);
      addReplace(decos, codeTo - 1, codeTo);
    }
  }
}

function addStrikethroughDecorations(
  view: EditorView,
  decos: Array<{ from: number; to: number; deco: Decoration }>,
) {
  const strikeRe = /~~([^~\n]+)~~/g;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    strikeRe.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = strikeRe.exec(text)) !== null) {
      const spanFrom = from + match.index;
      const spanTo = spanFrom + match[0].length;
      if (selectionIntersects(view, spanFrom, spanTo)) continue;

      addReplace(decos, spanFrom, spanFrom + 2);
      addReplace(decos, spanTo - 2, spanTo);
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const decos: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'StrongEmphasis' || node.name === 'Emphasis') {
          if (selectionIntersects(view, node.from, node.to)) return;

          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === 'EmphasisMark') {
                addReplace(decos, cursor.from, cursor.to);
              }
            } while (cursor.nextSibling());
          }
          return;
        }

        if (!node.name.startsWith('ATXHeading')) return;
        if (selectionIntersects(view, node.from, node.to)) return;

        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'HeaderMark') {
              addReplace(decos, cursor.from, cursor.to - 1);
            }
          } while (cursor.nextSibling());
        }
      },
    });
  }

  addInlineCodeDecorations(view, decos);
  addStrikethroughDecorations(view, decos);

  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const { from, to, deco } of decos) {
    builder.add(from, to, deco);
  }

  return builder.finish();
}

const markdownMarkupPlugin = ViewPlugin.define(
  (view) => ({
    decorations: buildDecorations(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    },
  }),
  {
    decorations: (value) => value.decorations,
  },
);

export function markdownMarkupDecorations(enabled: boolean): Extension {
  return enabled ? markdownMarkupPlugin : [];
}
