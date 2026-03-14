import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { type Extension, RangeSetBuilder } from '@codemirror/state';

/** Resolve a relative image src to the assets API endpoint. */
function resolveImageSrc(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('/') || src.startsWith('data:')) {
    return src;
  }
  return '/api/v1/assets/' + src.replace(/ /g, '%20');
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-image-widget';
    const img = document.createElement('img');
    img.src = resolveImageSrc(this.src);
    img.alt = this.alt;
    img.className = 'cm-image-inline';
    wrapper.appendChild(img);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

// Matches ![alt text](path/to/image.ext) — alt and path may contain spaces
const imageRe = /!\[([^\]]*)\]\(([^)]+)\)/g;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const cursors = state.selection.ranges.map((r) => ({ from: r.from, to: r.to }));

  const decos: { from: number; to: number; deco: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    imageRe.lastIndex = 0;
    let match;
    while ((match = imageRe.exec(text)) !== null) {
      const mFrom = from + match.index;
      const mTo = mFrom + match[0].length;

      // Show raw markdown when cursor is inside
      const cursorInside = cursors.some((c) => c.from >= mFrom && c.from <= mTo);
      if (cursorInside) continue;

      const [, alt, src] = match;
      decos.push({
        from: mFrom,
        to: mTo,
        deco: Decoration.replace({
          widget: new ImageWidget(src, alt),
        }),
      });
    }
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const d of decos) {
    builder.add(d.from, d.to, d.deco);
  }

  return builder.finish();
}

const imagePlugin = ViewPlugin.define(
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

export function imageDecorations(): Extension {
  return [imagePlugin];
}
