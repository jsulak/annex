import type { Extension } from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';

export function saveKeymap(onSave: () => void): Extension {
  return keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        onSave();
        return true;
      },
    },
  ]);
}

/**
 * Check whether a marker at `pos` is standalone (not part of a larger marker).
 * For single `*`, ensures it's not part of `**`.
 * For `**`, ensures it's not part of `***`.
 */
function isStandaloneMarker(doc: string, pos: number, marker: string): boolean {
  if (marker === '*') {
    const charBefore = pos > 0 ? doc[pos - 1] : '';
    const charAfter = pos + 1 < doc.length ? doc[pos + 1] : '';
    return charBefore !== '*' && charAfter !== '*';
  }
  if (marker === '**') {
    const charBefore = pos > 0 ? doc[pos - 1] : '';
    const charAfter = pos + 2 < doc.length ? doc[pos + 2] : '';
    return charBefore !== '*' && charAfter !== '*';
  }
  return true;
}

interface UnwrapRange {
  outerFrom: number;
  outerTo: number;
  innerFrom: number;
  innerTo: number;
}

/**
 * Search the current line for enclosing markers around `pos`.
 * Returns the range of the full marked-up region and the inner content, or null.
 */
function findEnclosingMarkers(
  doc: string,
  pos: number,
  before: string,
  after: string,
): UnwrapRange | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = doc.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = doc.length;

  // Scan backward for opening marker
  let openPos: number | null = null;
  for (let i = pos - 1; i >= lineStart; i--) {
    if (i + before.length <= doc.length && doc.slice(i, i + before.length) === before) {
      if (isStandaloneMarker(doc, i, before)) {
        openPos = i;
        break;
      }
    }
  }
  if (openPos === null) return null;

  // Scan forward for closing marker
  let closePos: number | null = null;
  for (let i = pos; i <= lineEnd - after.length; i++) {
    if (doc.slice(i, i + after.length) === after) {
      if (isStandaloneMarker(doc, i, after)) {
        closePos = i;
        break;
      }
    }
  }
  if (closePos === null) return null;

  return {
    outerFrom: openPos,
    outerTo: closePos + after.length,
    innerFrom: openPos + before.length,
    innerTo: closePos,
  };
}

/**
 * Try to find an unwrap target: markers immediately around the selection,
 * the selection itself containing markers, or (for cursor) enclosing markers on the line.
 */
function findUnwrap(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
): UnwrapRange | null {
  // Case 1: Markers immediately surround the selection/cursor
  const prefixStart = from - before.length;
  const suffixEnd = to + after.length;
  if (prefixStart >= 0 && suffixEnd <= doc.length) {
    if (doc.slice(prefixStart, from) === before && doc.slice(to, suffixEnd) === after) {
      if (isStandaloneMarker(doc, prefixStart, before) && isStandaloneMarker(doc, to, after)) {
        return { outerFrom: prefixStart, outerTo: suffixEnd, innerFrom: from, innerTo: to };
      }
    }
  }

  // Case 2: Selection includes the markers
  if (from !== to) {
    const selected = doc.slice(from, to);
    if (
      selected.startsWith(before) &&
      selected.endsWith(after) &&
      selected.length >= before.length + after.length
    ) {
      return {
        outerFrom: from,
        outerTo: to,
        innerFrom: from + before.length,
        innerTo: to - after.length,
      };
    }
  }

  // Case 3: Cursor inside a formatted region — scan the line
  if (from === to) {
    return findEnclosingMarkers(doc, from, before, after);
  }

  // Case 4: Selection is within a formatted region — scan outward
  const enclosing = findEnclosingMarkersAround(doc, from, to, before, after);
  if (enclosing) return enclosing;

  return null;
}

/**
 * Find enclosing markers around a selection range (from..to).
 * The opening marker must be before `from` and the closing marker must be after `to`.
 */
function findEnclosingMarkersAround(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
): UnwrapRange | null {
  const lineStart = doc.lastIndexOf('\n', from - 1) + 1;
  let lineEnd = doc.indexOf('\n', to);
  if (lineEnd === -1) lineEnd = doc.length;

  // Scan backward from `from` for opening marker
  let openPos: number | null = null;
  for (let i = from - 1; i >= lineStart; i--) {
    if (i + before.length <= doc.length && doc.slice(i, i + before.length) === before) {
      if (isStandaloneMarker(doc, i, before)) {
        openPos = i;
        break;
      }
    }
  }
  if (openPos === null) return null;

  // Scan forward from `to` for closing marker
  let closePos: number | null = null;
  for (let i = to; i <= lineEnd - after.length; i++) {
    if (doc.slice(i, i + after.length) === after) {
      if (isStandaloneMarker(doc, i, after)) {
        closePos = i;
        break;
      }
    }
  }
  if (closePos === null) return null;

  // Verify the selection is actually inside the markers
  if (openPos + before.length <= from && to <= closePos) {
    return {
      outerFrom: openPos,
      outerTo: closePos + after.length,
      innerFrom: openPos + before.length,
      innerTo: closePos,
    };
  }

  return null;
}

/** Wrap selection with markers, or unwrap if already inside a formatted region. */
function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();

  // Try to unwrap (toggle off)
  const unwrap = findUnwrap(doc, from, to, before, after);
  if (unwrap) {
    const inner = doc.slice(unwrap.innerFrom, unwrap.innerTo);
    if (from === to) {
      // Cursor: maintain relative position within the content
      const cursorInContent = Math.max(0, from - unwrap.innerFrom);
      const newCursor = unwrap.outerFrom + Math.min(cursorInContent, inner.length);
      view.dispatch({
        changes: { from: unwrap.outerFrom, to: unwrap.outerTo, insert: inner },
        selection: { anchor: newCursor },
      });
    } else {
      // Selection: select the inner content at its new position
      view.dispatch({
        changes: { from: unwrap.outerFrom, to: unwrap.outerTo, insert: inner },
        selection: { anchor: unwrap.outerFrom, head: unwrap.outerFrom + inner.length },
      });
    }
    return true;
  }

  // Not in a formatted region — apply formatting
  const selected = view.state.sliceDoc(from, to);
  if (from === to) {
    view.dispatch({
      changes: { from, to, insert: before + after },
      selection: { anchor: from + before.length },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
  }
  return true;
}

/**
 * Find a markdown link [text](url) enclosing the given position on the same line.
 * Returns the full range and the text portion, or null.
 */
function findEnclosingLink(
  doc: string,
  pos: number,
): { outerFrom: number; outerTo: number; text: string } | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = doc.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = doc.length;
  const line = doc.slice(lineStart, lineEnd);

  // Find all markdown links on this line using regex
  const linkRe = /\[([^\]]*)\]\([^)]*\)/g;
  let match;
  while ((match = linkRe.exec(line)) !== null) {
    const matchFrom = lineStart + match.index;
    const matchTo = matchFrom + match[0].length;
    if (pos >= matchFrom && pos <= matchTo) {
      return { outerFrom: matchFrom, outerTo: matchTo, text: match[1] };
    }
  }
  return null;
}

/** Insert a markdown link around selection, or toggle off if inside a link. */
function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();

  // Check if cursor/selection is inside an existing link — toggle off
  const link = findEnclosingLink(doc, from);
  if (link) {
    const newCursor = link.outerFrom + link.text.length;
    view.dispatch({
      changes: { from: link.outerFrom, to: link.outerTo, insert: link.text },
      selection: { anchor: Math.min(newCursor, link.outerFrom + link.text.length) },
    });
    return true;
  }

  const selected = view.state.sliceDoc(from, to);
  if (from === to) {
    const template = '[](url)';
    view.dispatch({
      changes: { from, to, insert: template },
      selection: { anchor: from + 1 },
    });
  } else {
    const result = `[${selected}](url)`;
    const urlStart = from + 1 + selected.length + 2;
    view.dispatch({
      changes: { from, to, insert: result },
      selection: { anchor: urlStart, head: urlStart + 3 },
    });
  }
  return true;
}

export function formattingKeymap(): Extension {
  return keymap.of([
    { key: 'Mod-b', run: (view) => wrapSelection(view, '**', '**') },
    { key: 'Mod-i', run: (view) => wrapSelection(view, '*', '*') },
    { key: 'Mod-u', run: (view) => wrapSelection(view, '<u>', '</u>') },
    { key: 'Mod-k', run: (view) => insertLink(view) },
  ]);
}
