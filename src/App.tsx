import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage.js';
import AppLayout from './components/AppLayout.js';

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
    // Push /login into the URL bar without a reload
    if (window.location.pathname !== '/login') {
      window.history.replaceState(null, '', '/login');
    }
    return <LoginPage onLogin={() => {
      window.history.replaceState(null, '', '/');
      setAuthed(true);
    }} />;
  }

  // Clear /login from URL if we're authenticated
  if (window.location.pathname === '/login') {
    window.history.replaceState(null, '', '/');
  }

  return <AppLayout />;
}
