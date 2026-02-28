import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';

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
