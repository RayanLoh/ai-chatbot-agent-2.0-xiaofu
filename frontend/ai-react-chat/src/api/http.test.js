// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { parseError, requestJson } from './http';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('marks guest-session failures as not dispatched to the target endpoint', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
    JSON.stringify({ detail: 'Database operation failed' }), { status: 503 }));
  await expect(requestJson('/generate', { method: 'POST' })).rejects.toMatchObject({ status: 503, requestNotSent: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain('/guest-session');
});

it('keeps the login token when Google verification is temporarily unavailable', async () => {
  const token = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 }))}.signature`;
  localStorage.setItem('auth_token', token);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: {
    detail: 'Please retry', code: 'AUTH_SERVICE_UNAVAILABLE',
  } }), { status: 503 }));
  await expect(requestJson('/conversations')).rejects.toMatchObject({ status: 503, code: 'AUTH_SERVICE_UNAVAILABLE' });
  expect(localStorage.getItem('auth_token')).toBe(token);
});

it('preserves status and code from nested FastAPI errors', async () => {
  const error = await parseError(new Response(JSON.stringify({
    detail: { detail: 'Sign in again', code: 'INVALID_AUTH_TOKEN' },
  }), { status: 401 }));
  expect(error.message).toBe('Sign in again');
  expect(error.status).toBe(401);
  expect(error.code).toBe('INVALID_AUTH_TOKEN');
});

it('uses one signed guest session for simultaneous initial requests', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(JSON.stringify(
    url.endsWith('/guest-session') ? { token: 'signed-token' } : { conversations: [] },
  )));
  await Promise.all([requestJson('/conversations'), requestJson('/conversations')]);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/guest-session'))).toHaveLength(1);
  const request = fetchMock.mock.calls.find(([url]) => url.endsWith('/conversations'));
  expect(request[1].headers['X-Guest-Token']).toBe('signed-token');
  expect(request[1].headers['X-Guest-Id']).toBeUndefined();
});

it('replaces an expired guest token once without replaying authentication errors', async () => {
  localStorage.setItem('guest_token', 'expired');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (url.endsWith('/guest-session')) return new Response(JSON.stringify({ token: 'fresh' }));
    if (options.headers['X-Guest-Token'] === 'expired') {
      return new Response(JSON.stringify({ detail: { detail: 'Expired', code: 'INVALID_GUEST_TOKEN' } }), { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }));
  });
  expect(await requestJson('/conversations')).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('formats request validation errors as text', async () => {
  const error = await parseError(new Response(JSON.stringify({ detail: [{ msg: 'Unsupported model' }] }), { status: 422 }));
  expect(error.message).toBe('Unsupported model');
});
