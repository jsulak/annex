import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

export const setSearchTermsEffect = StateEffect.define<string[]>();
export interface SearchHighlightRange {
  from: number;
  to: number;
}
export const setSearchRangesEffect = StateEffect.define<SearchHighlightRange[]>();

const searchMark = Decoration.mark({ class: 'cm-search-highlight' });

function buildDecorations(docText: string, terms: string[]): DecorationSet {
  if (terms.length === 0) return Decoration.none;

  const text = docText.toLowerCase();
  const hits: Array<{ from: number; to: number }> = [];

  for (const term of terms) {
    const tl = term.toLowerCase();
    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(tl, pos);
      if (idx === -1) break;
      hits.push({ from: idx, to: idx + tl.length });
      pos = idx + 1;
    }
  }

  if (hits.length === 0) return Decoration.none;

  // Sort by position, remove overlaps
  hits.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const { from, to } of hits) {
    if (from >= lastTo) {
      builder.add(from, to, searchMark);
      lastTo = to;
    }
  }
  return builder.finish();
}

function buildRangeDecorations(docLength: number, ranges: SearchHighlightRange[]): DecorationSet {
  if (ranges.length === 0) return Decoration.none;

  const normalized = ranges
    .map((range) => ({
      from: Math.max(0, Math.min(docLength, range.from)),
      to: Math.max(0, Math.min(docLength, range.to)),
    }))
    .filter((range) => range.to > range.from)
    .sort((a, b) => a.from - b.from);

  if (normalized.length === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const { from, to } of normalized) {
    if (from >= lastTo) {
      builder.add(from, to, searchMark);
      lastTo = to;
    }
  }
  return builder.finish();
}

export const searchHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    // Remap decorations through document changes
    let updated = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchTermsEffect)) {
        updated = buildDecorations(tr.newDoc.toString(), effect.value);
      } else if (effect.is(setSearchRangesEffect)) {
        updated = buildRangeDecorations(tr.newDoc.length, effect.value);
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});
