import { EditorView } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { uploadImage, UploadError } from '../api/uploadImage.js';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
]);

function isImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.has(file.type);
}

/** Insert text at the current cursor (or replace selection). */
function insertAt(view: EditorView, pos: number, text: string): void {
  view.dispatch({ changes: { from: pos, to: pos, insert: text } });
}

/** Replace a range with text. */
function replaceRange(view: EditorView, from: number, to: number, text: string): void {
  view.dispatch({ changes: { from, to, insert: text } });
}

async function handleUpload(view: EditorView, file: File, insertPos: number, onStatus: StatusCallback) {
  const placeholder = '![uploading...]()';
  insertAt(view, insertPos, placeholder);
  const placeholderEnd = insertPos + placeholder.length;

  onStatus('uploading');
  try {
    const { path } = await uploadImage(file);
    const alt = file.name.replace(/\.[^.]+$/, '');
    const markdown = `![${alt}](${path})`;
    // Find placeholder by scanning near the expected position
    const docLen = view.state.doc.length;
    const searchFrom = Math.max(0, insertPos);
    const searchTo = Math.min(docLen, placeholderEnd + 10);
    const slice = view.state.doc.sliceString(searchFrom, searchTo);
    const idx = slice.indexOf(placeholder);
    if (idx >= 0) {
      replaceRange(view, searchFrom + idx, searchFrom + idx + placeholder.length, markdown);
    }
    onStatus('idle');
  } catch (err) {
    // Remove placeholder
    const docLen = view.state.doc.length;
    const searchFrom = Math.max(0, insertPos);
    const searchTo = Math.min(docLen, placeholderEnd + 10);
    const slice = view.state.doc.sliceString(searchFrom, searchTo);
    const idx = slice.indexOf(placeholder);
    if (idx >= 0) {
      replaceRange(view, searchFrom + idx, searchFrom + idx + placeholder.length, '');
    }
    const msg = err instanceof UploadError ? err.message : 'Upload failed';
    onStatus('error', msg);
  }
}

export type UploadStatus = 'idle' | 'uploading' | 'error';
type StatusCallback = (status: UploadStatus, message?: string) => void;

export function imageUpload(onStatus: StatusCallback): Extension {
  return EditorView.domEventHandlers({
    drop(event: DragEvent, view: EditorView) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      const imageFiles = Array.from(files).filter(isImageFile);
      if (imageFiles.length === 0) return false;

      event.preventDefault();

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.doc.length;

      for (const file of imageFiles) {
        void handleUpload(view, file, pos, onStatus);
      }
      return true;
    },

    paste(event: ClipboardEvent, view: EditorView) {
      const items = event.clipboardData?.items;
      if (!items) return false;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && ALLOWED_IMAGE_TYPES.has(item.type)) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return false;

      event.preventDefault();
      const pos = view.state.selection.main.from;
      for (const file of imageFiles) {
        void handleUpload(view, file, pos, onStatus);
      }
      return true;
    },
  });
}
