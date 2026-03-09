import { useState, useEffect, useRef } from 'react';

interface Props {
  visible: boolean;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export default function NewNoteDialog({ visible, onConfirm, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      // Focus after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-editor)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '20px',
          width: '400px',
          maxWidth: '90vw',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'var(--text-primary)',
            marginBottom: '12px',
          }}
        >
          New Note
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--bg-app)',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '6px 14px',
              border: '1px solid var(--border)',
              borderRadius: '2px',
              background: 'var(--bg-app)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '6px 14px',
              border: '1px solid var(--border)',
              borderRadius: '2px',
              background: title.trim() ? 'var(--bg-selected)' : 'var(--bg-app)',
              color: title.trim() ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: title.trim() ? 'pointer' : 'default',
            }}
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
