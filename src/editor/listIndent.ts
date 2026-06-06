import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

// Matches list markers or blockquote prefixes:
//   - bullet:     "  - ", "* ", "+ "
//   - ordered:    "1. ", "2) "
//   - blockquote: "> ", ">> ", "> > "
const listLineRe = /^(\s*(?:[-*+]|\d+[.)]) )/;
const quoteLineRe = /^(\s*(?:>\s*)+)/;
const headingLineRe = /^ {0,3}(#{1,6})(?:\s|$)/;

function lineStyle(sectionIndent: number, hangingPrefixLength: number): string {
  if (hangingPrefixLength > 0) {
    return `padding-left: calc(${sectionIndent}ch + ${hangingPrefixLength}ch); text-indent: -${hangingPrefixLength}ch;`;
  }
  return sectionIndent > 0 ? `padding-left: ${sectionIndent}ch;` : '';
}

function buildDecorations(view: EditorView, indentUnderHeadings: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const visibleLines = new Set<number>();
  let lastVisibleLine = 0;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      visibleLines.add(line.number);
      lastVisibleLine = Math.max(lastVisibleLine, line.number);
      pos = line.to + 1;
    }
  }

  let sectionIndent = 0;
  for (let lineNumber = 1; lineNumber <= lastVisibleLine; lineNumber++) {
    const line = view.state.doc.line(lineNumber);
    const headingMatch = headingLineRe.exec(line.text);
    const isHeading = Boolean(headingMatch);

    if (headingMatch) {
      sectionIndent = indentUnderHeadings ? headingMatch[1].length * 2 : 0;
    }

    if (!visibleLines.has(lineNumber)) continue;
    if (isHeading || line.text.trim() === '') continue;

    const listMatch = listLineRe.exec(line.text);
    const quoteMatch = !listMatch ? quoteLineRe.exec(line.text) : null;
    const hangingPrefixLength = listMatch ? listMatch[1].length : quoteMatch ? quoteMatch[1].length : 0;
    const style = lineStyle(sectionIndent, hangingPrefixLength);

    if (style) {
      const deco = Decoration.line({
        attributes: {
          style,
        },
      });
      builder.add(line.from, line.from, deco);
    }
  }

  return builder.finish();
}

function createIndentPlugin(indentUnderHeadings: boolean): Extension {
  return ViewPlugin.define(
    (view) => ({
      decorations: buildDecorations(view, indentUnderHeadings),
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, indentUnderHeadings);
        }
      }
    }),
    {
      decorations: (v) => v.decorations,
    },
  );
}

export function editorIndentDecorations(indentUnderHeadings: boolean): Extension {
  return createIndentPlugin(indentUnderHeadings);
}

export const listIndent: Extension = editorIndentDecorations(false);
