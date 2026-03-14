export let _csrfToken: string | null = null;

/** Fetch a fresh CSRF token from the server and store it in memory. */
export async function fetchCsrfToken(): Promise<void> {
  try {
    const res = await fetch('/api/v1/auth/csrf-token');
    if (res.ok) {
      const data = await res.json() as { token: string };
      _csrfToken = data.token;
    }
  } catch {
    // Will be retried on next mount or mutation
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> };
  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  const method = (options.method ?? 'GET').toUpperCase();
  if (MUTATING_METHODS.has(method) && _csrfToken) {
    headers['x-csrf-token'] = _csrfToken;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (res.status === 401 && !path.includes('/auth/login')) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return res;
}
