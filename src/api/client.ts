export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> };
  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
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
