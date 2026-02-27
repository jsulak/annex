export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401 && !path.includes('/auth/login')) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return res;
}
