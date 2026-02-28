import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore.js';
import { apiFetch } from '../api/client.js';

interface Settings {
  autoSaveDelay: number;
  showSnippets: boolean;
  editorWidth: number;
  fontSize: number;
  noteTemplate: string;
  indexExtensions: string[];
  darkMode: 'auto' | 'light' | 'dark';
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--text-secondary)',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: '2px',
  background: 'var(--bg-editor)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  padding: '6px 16px',
  border: '1px solid var(--border)',
  borderRadius: '2px',
  background: 'var(--bg-app)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

export default function SettingsPanel() {
  const setSettingsVisible = useStore((s) => s.setSettingsVisible);
  const setAppSettings = useStore((s) => s.setAppSettings);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/v1/config');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const close = useCallback(() => {
    setSettingsVisible(false);
  }, [setSettingsVisible]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/v1/config', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppSettings(data.settings);
        setMessage({ text: 'Settings saved', error: false });
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Save failed', error: true });
      }
    } catch {
      setMessage({ text: 'Network error', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwMessage(null);
    if (!currentPassword || !newPassword) {
      setPwMessage({ text: 'Both fields are required', error: true });
      return;
    }
    if (newPassword.length < 8) {
      setPwMessage({ text: 'New password must be at least 8 characters', error: true });
      return;
    }
    setPwSaving(true);
    try {
      const res = await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPwMessage({ text: 'Password changed. You will be logged out.', error: false });
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        const data = await res.json();
        setPwMessage({ text: data.error || 'Password change failed', error: true });
      }
    } catch {
      setPwMessage({ text: 'Network error', error: true });
    } finally {
      setPwSaving(false);
    }
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => s ? { ...s, [key]: value } : s);
  };

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '8vh',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '480px',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'var(--bg-editor)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          padding: '20px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 16px',
            color: 'var(--text-primary)',
          }}
        >
          Settings
        </h2>

        {loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        )}

        {settings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Auto-save delay */}
            <div>
              <div style={labelStyle}>Auto-save delay (ms)</div>
              <input
                type="number"
                min={200}
                step={100}
                value={settings.autoSaveDelay}
                onChange={(e) => update('autoSaveDelay', parseInt(e.target.value, 10) || 1000)}
                style={inputStyle}
              />
            </div>

            {/* Show snippets */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.showSnippets}
                onChange={(e) => update('showSnippets', e.target.checked)}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                Show snippets in note list
              </span>
            </label>

            {/* Editor width */}
            <div>
              <div style={labelStyle}>Editor width (px)</div>
              <input
                type="number"
                min={400}
                step={10}
                value={settings.editorWidth}
                onChange={(e) => update('editorWidth', parseInt(e.target.value, 10) || 680)}
                style={inputStyle}
              />
            </div>

            {/* Font size */}
            <div>
              <div style={labelStyle}>Font size (px)</div>
              <input
                type="number"
                min={10}
                max={24}
                value={settings.fontSize}
                onChange={(e) => update('fontSize', parseInt(e.target.value, 10) || 13)}
                style={inputStyle}
              />
            </div>

            {/* Note template */}
            <div>
              <div style={labelStyle}>Note template</div>
              <textarea
                rows={3}
                value={settings.noteTemplate}
                onChange={(e) => update('noteTemplate', e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* File extensions */}
            <div>
              <div style={labelStyle}>File extensions (comma-separated)</div>
              <input
                type="text"
                value={settings.indexExtensions.join(', ')}
                onChange={(e) =>
                  update(
                    'indexExtensions',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  )
                }
                style={inputStyle}
              />
            </div>

            {/* Dark mode */}
            <div>
              <div style={labelStyle}>Theme</div>
              <select
                value={settings.darkMode}
                onChange={(e) => update('darkMode', e.target.value as Settings['darkMode'])}
                style={inputStyle}
              >
                <option value="auto">Auto (system)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <button onClick={handleSave} disabled={saving} style={buttonStyle}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
              {message && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: message.error ? '#e55' : '#5a5',
                  }}
                >
                  {message.text}
                </span>
              )}
            </div>

            {/* Divider */}
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {/* Change password */}
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 600,
                margin: '0',
                color: 'var(--text-primary)',
              }}
            >
              Change password
            </h3>
            <div>
              <div style={labelStyle}>Current password</div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>New password</div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={handlePasswordChange} disabled={pwSaving} style={buttonStyle}>
                {pwSaving ? 'Changing...' : 'Change password'}
              </button>
              {pwMessage && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: pwMessage.error ? '#e55' : '#5a5',
                  }}
                >
                  {pwMessage.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
