import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  hoverTooltip,
  type Tooltip,
} from '@codemirror/view';
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// ---------------------------------------------------------------------------
// Widget: small ↗ icon that replaces ](url) when cursor is outside the link
// ---------------------------------------------------------------------------

class LinkIconWidget extends WidgetType {
  constructor(readonly url: string) {
    super();
  }

  eq(other: LinkIconWidget) {
    return this.url === other.url;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-link-icon';
    span.textContent = '(\u2197)'; // (↗)
    span.dataset.url = this.url;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Build decorations by walking the syntax tree for Link nodes
// ---------------------------------------------------------------------------

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const cursors = state.selection.ranges.map((r) => ({ from: r.from, to: r.to }));

  // Collect all ranges that are part of inline links so bare-URL pass can skip them
  const inlineLinkRanges: { from: number; to: number }[] = [];

  // We need sorted decorations — collect then sort before adding to builder
  const decos: { from: number; to: number; deco: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Link') return;

        const linkFrom = node.from;
        const linkTo = node.to;
        inlineLinkRanges.push({ from: linkFrom, to: linkTo });

        // Check if any cursor intersects this link range
        const cursorInside = cursors.some(
          (c) => c.from >= linkFrom && c.from <= linkTo,
        );

        if (cursorInside) return; // Show full markdown when editing

        // Walk children to find LinkMark positions and URL.
        // Lezer markdown tree for inline links:
        //   LinkMark [   LinkMark ]   LinkMark (   URL   LinkMark )
        // The text between [ and ] is inline content (no LinkLabel wrapper).
        let openBracket = -1;   // position of [
        let closeBracket = -1;  // position of ]
        let urlText = '';

        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'URL') {
              urlText = state.doc.sliceString(cursor.from, cursor.to);
            } else if (cursor.name === 'LinkMark') {
              const mark = state.doc.sliceString(cursor.from, cursor.to);
              if (mark === '[' && openBracket === -1) {
                openBracket = cursor.from;
              } else if (mark === ']') {
                closeBracket = cursor.from;
              }
            }
          } while (cursor.nextSibling());
        }

        if (openBracket === -1 || closeBracket === -1 || !urlText) return;

        // Hide the opening [ : replace it with nothing
        decos.push({
          from: openBracket,
          to: openBracket + 1,
          deco: Decoration.replace({}),
        });

        // Mark the visible text with accent color / underline (store URL for click handler)
        decos.push({
          from: openBracket + 1,
          to: closeBracket,
          deco: Decoration.mark({
            class: 'cm-inline-link',
            attributes: { 'data-url': urlText },
          }),
        });

        // Replace ](url) with icon widget
        decos.push({
          from: closeBracket,
          to: linkTo,
          deco: Decoration.replace({
            widget: new LinkIconWidget(urlText),
          }),
        });
      },
    });
  }

  // Bare URLs: find URLs in visible text that are NOT inside inline link ranges
  const bareUrlRe = /https?:\/\/[^\s)>\]]+/g;
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    let match;
    while ((match = bareUrlRe.exec(text)) !== null) {
      const mFrom = from + match.index;
      const mTo = mFrom + match[0].length;

      // Skip if inside an inline link range
      const insideLink = inlineLinkRanges.some(
        (r) => mFrom >= r.from && mTo <= r.to,
      );
      if (insideLink) continue;

      // Skip if cursor is inside this URL
      const cursorInUrl = cursors.some(
        (c) => c.from >= mFrom && c.from <= mTo,
      );
      if (cursorInUrl) continue;

      decos.push({
        from: mFrom,
        to: mTo,
        deco: Decoration.mark({ class: 'cm-bare-url' }),
      });
    }
  }

  // Sort by from position (required by RangeSetBuilder)
  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const d of decos) {
    builder.add(d.from, d.to, d.deco);
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// ViewPlugin
// ---------------------------------------------------------------------------

const linkPlugin = ViewPlugin.define(
  (view) => ({
    decorations: buildDecorations(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    },
  }),
  {
    decorations: (v) => v.decorations,
  },
);

// ---------------------------------------------------------------------------
// Hover tooltip: show URL when hovering over a collapsed inline link
// ---------------------------------------------------------------------------

const linkHoverTooltip = hoverTooltip(
  (view, pos): Tooltip | null => {
    const state = view.state;
    const tree = syntaxTree(state);

    // Walk up to find if pos is inside a Link node
    let linkNode = tree.resolveInner(pos, 1);
    while (linkNode && linkNode.name !== 'Link') {
      if (!linkNode.parent) break;
      linkNode = linkNode.parent;
    }
    if (!linkNode || linkNode.name !== 'Link') return null;

    // Only show tooltip when the link is collapsed (cursor outside)
    const cursors = state.selection.ranges;
    const cursorInside = cursors.some(
      (c) => c.from >= linkNode!.from && c.from <= linkNode!.to,
    );
    if (cursorInside) return null;

    // Extract URL from the Link node
    let urlText = '';
    const cursor = linkNode.cursor();
    if (cursor.firstChild()) {
      do {
        if (cursor.name === 'URL') {
          urlText = state.doc.sliceString(cursor.from, cursor.to);
          break;
        }
      } while (cursor.nextSibling());
    }

    if (!urlText) return null;

    return {
      pos: linkNode.from,
      end: linkNode.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = 'cm-link-tooltip';
        dom.textContent = urlText;
        return { dom };
      },
    };
  },
  { hoverTime: 300 },
);

// ---------------------------------------------------------------------------
// Click handler: open URLs on icon click or bare-URL click
// ---------------------------------------------------------------------------

// Use mousedown so we can intercept before CM moves the cursor
// (which would expand the link and destroy the decoration DOM).
const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const target = event.target as HTMLElement;

    // Click on link icon — place cursor inside the link to expand it for editing.
    if (target.classList.contains('cm-link-icon')) {
      // The icon widget replaces ](url). Place cursor at the ] position
      // (inside the link range) so the link expands.
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        event.preventDefault();
        // posAtCoords on a replace widget may land at the edge — find the
        // Link node that contains this position and place cursor mid-link.
        const tree = syntaxTree(view.state);
        let node = tree.resolveInner(pos, -1);
        while (node && node.name !== 'Link') {
          if (!node.parent) break;
          node = node.parent;
        }
        const cursorPos = node?.name === 'Link' ? node.from + 1 : pos;
        view.dispatch({ selection: { anchor: cursorPos } });
      }
      return true;
    }

    // Click on inline link text — open the URL
    const inlineLink = target.closest('.cm-inline-link') as HTMLElement | null;
    if (inlineLink) {
      const url = inlineLink.dataset.url;
      if (url) {
        event.preventDefault();
        window.open(url, '_blank', 'noopener');
        return true;
      }
    }

    // Click on bare URL
    if (target.closest('.cm-bare-url')) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const bareUrlRe = /https?:\/\/[^\s)>\]]+/g;
      let match;
      while ((match = bareUrlRe.exec(lineText)) !== null) {
        const mFrom = line.from + match.index;
        const mTo = mFrom + match[0].length;
        if (pos >= mFrom && pos <= mTo) {
          event.preventDefault();
          window.open(match[0], '_blank', 'noopener');
          return true;
        }
      }
    }

    return false;
  },
});

// ---------------------------------------------------------------------------
// Exported extension
// ---------------------------------------------------------------------------

export function linkDecorations(): Extension {
  return [linkPlugin, linkHoverTooltip, linkClickHandler];
}
