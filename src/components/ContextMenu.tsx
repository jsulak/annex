import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  // Adjust position if menu would overflow viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 2000,
    background: 'var(--bg-editor)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    padding: '4px 0',
    minWidth: '140px',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  };

  return (
    <div ref={menuRef} style={style} data-testid="context-menu">
      {items.map((item) => (
        <div
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            padding: '6px 16px',
            cursor: 'pointer',
            color: item.danger ? 'var(--danger, #c44)' : 'var(--text-primary)',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'var(--bg-selected)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'transparent';
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
