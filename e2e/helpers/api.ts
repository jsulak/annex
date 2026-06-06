import { expect, type APIRequestContext } from '@playwright/test';

type RequestOptions = Parameters<APIRequestContext['put']>[1];

async function csrfHeaders(request: APIRequestContext) {
  const res = await request.get('/api/v1/auth/csrf-token');
  expect(res.ok()).toBe(true);
  const data = await res.json() as { token: string };
  return { 'x-csrf-token': data.token };
}

async function withCsrf(request: APIRequestContext, options: RequestOptions = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...await csrfHeaders(request),
    },
  };
}

export async function apiPut(request: APIRequestContext, url: string, options?: RequestOptions) {
  return request.put(url, await withCsrf(request, options));
}

export async function apiPost(request: APIRequestContext, url: string, options?: RequestOptions) {
  return request.post(url, await withCsrf(request, options));
}

export async function apiDelete(request: APIRequestContext, url: string, options?: RequestOptions) {
  return request.delete(url, await withCsrf(request, options));
}
