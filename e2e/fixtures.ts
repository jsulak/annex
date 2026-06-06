import { test as base, expect, type APIRequestContext } from '@playwright/test';

type RequestOptions = Parameters<APIRequestContext['put']>[1];
type FetchOptions = Parameters<APIRequestContext['fetch']>[1];

function hasEmptyCookieHeader(options: RequestOptions | FetchOptions = {}) {
  const headers = options.headers ?? {};
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === 'cookie' && value === '',
  );
}

async function csrfHeader(request: APIRequestContext) {
  const res = await request.get('/api/v1/auth/csrf-token');
  expect(res.ok()).toBe(true);
  const data = await res.json() as { token: string };
  return { 'x-csrf-token': data.token };
}

async function withCsrf(request: APIRequestContext, options: RequestOptions = {}) {
  if (hasEmptyCookieHeader(options)) return options;

  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...await csrfHeader(request),
    },
  };
}

async function withCsrfForFetch(request: APIRequestContext, options: FetchOptions = {}) {
  const method = options.method?.toUpperCase();
  if (!method || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return options;
  if (hasEmptyCookieHeader(options)) return options;

  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...await csrfHeader(request),
    },
  };
}

export const test = base.extend<{ request: APIRequestContext }>({
  request: async ({ request }, use) => {
    const proxy = new Proxy(request, {
      get(target, prop, receiver) {
        if (prop === 'put') {
          return async (url: string, options?: RequestOptions) =>
            target.put(url, await withCsrf(target, options));
        }
        if (prop === 'post') {
          return async (url: string, options?: RequestOptions) =>
            target.post(url, await withCsrf(target, options));
        }
        if (prop === 'delete') {
          return async (url: string, options?: RequestOptions) =>
            target.delete(url, await withCsrf(target, options));
        }
        if (prop === 'patch') {
          return async (url: string, options?: RequestOptions) =>
            target.patch(url, await withCsrf(target, options));
        }
        if (prop === 'fetch') {
          return async (url: string, options?: FetchOptions) =>
            target.fetch(url, await withCsrfForFetch(target, options));
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as APIRequestContext;

    await use(proxy);
  },
});

export { expect };
export type { APIRequestContext, Page } from '@playwright/test';
