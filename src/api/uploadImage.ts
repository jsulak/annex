import { _csrfToken } from './client.js';

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export async function uploadImage(file: File): Promise<{ path: string }> {
  const form = new FormData();
  form.append('file', file);

  // Import CSRF token without going through apiFetch (which sets Content-Type: application/json)
  // Browser must set Content-Type itself so it includes the multipart boundary
  const headers: Record<string, string> = {};
  if (_csrfToken) headers['x-csrf-token'] = _csrfToken;

  const res = await fetch('/api/v1/media', {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new UploadError(body.error ?? `Upload failed (${res.status})`);
  }

  return res.json() as Promise<{ path: string }>;
}
