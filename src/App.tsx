import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage.js';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/v1/auth/check')
      .then((res) => {
        setAuthed(res.ok);
      })
      .catch(() => {
        setAuthed(false);
      });
  }, []);

  // Loading state while checking auth
  if (authed === null) {
    return null;
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-app)',
      }}
    >
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        Logged in. App shell coming soon.
      </p>
    </div>
  );
}
