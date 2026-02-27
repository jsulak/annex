import { useState, FormEvent } from 'react';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onLogin();
      } else if (res.status === 429) {
        setError('Too many attempts. Try again in 15 minutes.');
      } else {
        const data = await res.json();
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
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
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '320px',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '18px',
            color: 'var(--text-primary)',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          ZettelWeb
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--bg-editor)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--bg-selected)',
            color: 'var(--text-primary)',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
        {error && (
          <p
            style={{
              color: '#c44',
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
