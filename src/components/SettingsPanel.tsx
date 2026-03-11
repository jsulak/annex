import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { apiFetch } from '../api/client.js';
import { getSyncStatus, getSyncConnections, getSyncDevices, addSyncDevice, type SyncDevice } from '../api/sync.js';

interface Settings {
  autoSaveDelay: number;
  showSnippets: boolean;
  editorWidth: number;
  fontSize: number;
  noteTemplate: string;
  indexExtensions: string[];
  darkMode: 'auto' | 'light' | 'dark';
  lineHeight: number;
}

interface HealthData {
  status: string;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  noteCount: number;
  notesDirBytes: number;
  notesDir: string;
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

  // Sync state
  const [syncAvailable, setSyncAvailable] = useState<boolean | null>(null);
  const [vpsDeviceId, setVpsDeviceId] = useState('');
  const [macDeviceId, setMacDeviceId] = useState('');
  const [existingDevice, setExistingDevice] = useState<SyncDevice | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unconfigured'>('unconfigured');
  const [syncMessage, setSyncMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [syncSaving, setSyncSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Server status state
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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

  // Fetch server health on mount
  useEffect(() => {
    let cancelled = false;
    setHealthLoading(true);
    void (async () => {
      try {
        const res = await apiFetch('/api/v1/health');
        if (res.ok && !cancelled) {
          const data = await res.json() as HealthData;
          setHealthData(data);
        }
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch sync status on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await getSyncStatus();
      if (cancelled) return;
      if (!status.available) {
        setSyncAvailable(false);
        return;
      }
      setSyncAvailable(true);
      setVpsDeviceId(status.myID);

      // Check for existing paired devices (exclude self)
      const devices = await getSyncDevices();
      if (cancelled) return;
      const remote = devices.find((d) => d.deviceID !== status.myID);
      if (remote) {
        setExistingDevice(remote);
        setMacDeviceId(remote.deviceID);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll connection status while panel is open
  useEffect(() => {
    if (!syncAvailable || !existingDevice) return;
    const check = async () => {
      const conns = await getSyncConnections();
      if (existingDevice && conns[existingDevice.deviceID]?.connected) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    };
    void check();
    pollRef.current = setInterval(check, 10_000);
    return () => clearInterval(pollRef.current);
  }, [syncAvailable, existingDevice]);

  const handlePairDevice = async () => {
    setSyncMessage(null);
    if (!macDeviceId || !/^[A-Z0-9]{7}(-[A-Z0-9]{7}){7}$/.test(macDeviceId)) {
      setSyncMessage({ text: 'Invalid device ID format', error: true });
      return;
    }
    setSyncSaving(true);
    try {
      const result = await addSyncDevice(macDeviceId);
      if (result.ok) {
        setExistingDevice({ deviceID: macDeviceId, name: 'Mac' });
        setSyncMessage({ text: 'Device paired and folder shared', error: false });
      } else {
        setSyncMessage({ text: result.error || 'Pairing failed', error: true });
      }
    } catch {
      setSyncMessage({ text: 'Network error', error: true });
    } finally {
      setSyncSaving(false);
    }
  };

  const handleCopyDeviceId = () => {
    void navigator.clipboard.writeText(vpsDeviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          maxWidth: 'calc(100vw - 24px)',
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

            {/* Line height */}
            <div>
              <div style={labelStyle}>Line height</div>
              <input
                type="number"
                min={1}
                max={3}
                step={0.1}
                value={settings.lineHeight ?? 1.6}
                onChange={(e) => update('lineHeight', parseFloat(e.target.value) || 1.6)}
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

            {/* Divider */}
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {/* Sync (Syncthing) */}
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 600,
                margin: '0',
                color: 'var(--text-primary)',
              }}
            >
              Sync (Syncthing)
            </h3>

            {syncAvailable === null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Checking...
              </div>
            )}

            {syncAvailable === false && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Syncthing is not configured on this server.
              </div>
            )}

            {syncAvailable && (
              <>
                {/* VPS Device ID */}
                <div>
                  <div style={labelStyle}>This server's Device ID</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={vpsDeviceId}
                      style={{ ...inputStyle, fontSize: '11px' }}
                    />
                    <button onClick={handleCopyDeviceId} style={{ ...buttonStyle, whiteSpace: 'nowrap' }}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Mac Device ID */}
                <div>
                  <div style={labelStyle}>Mac Device ID</div>
                  <input
                    type="text"
                    value={macDeviceId}
                    onChange={(e) => setMacDeviceId(e.target.value.toUpperCase())}
                    placeholder="XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX"
                    style={{ ...inputStyle, fontSize: '11px' }}
                  />
                </div>

                {/* Connection status */}
                {existingDevice && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: connectionStatus === 'connected' ? '#5a5' :
                          connectionStatus === 'disconnected' ? '#da5' : '#999',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {connectionStatus === 'connected'
                        ? `Connected to ${existingDevice.name || 'remote device'}`
                        : `Not connected to ${existingDevice.name || 'remote device'}`}
                    </span>
                  </div>
                )}

                {/* Pair button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={handlePairDevice} disabled={syncSaving} style={buttonStyle}>
                    {syncSaving ? 'Pairing...' : existingDevice ? 'Update device' : 'Pair device'}
                  </button>
                  {syncMessage && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: syncMessage.error ? '#e55' : '#5a5',
                      }}
                    >
                      {syncMessage.text}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Divider */}
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {/* Server Status */}
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 600,
                margin: '0',
                color: 'var(--text-primary)',
              }}
            >
              Server Status
            </h3>

            {healthLoading && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Loading...
              </div>
            )}

            {healthData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  ['Status', healthData.status],
                  ['Uptime', `${Math.floor(healthData.uptime / 3600)}h ${Math.floor((healthData.uptime % 3600) / 60)}m`],
                  ['Notes indexed', String(healthData.noteCount)],
                  ['Notes dir size', `${(healthData.notesDirBytes / 1024).toFixed(1)} KB`],
                  ['Heap used', `${(healthData.memory.heapUsed / 1024 / 1024).toFixed(1)} MB`],
                  ['Heap total', `${(healthData.memory.heapTotal / 1024 / 1024).toFixed(1)} MB`],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', minWidth: '120px' }}>
                      {label}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
