// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useAuth } from './useAuth';

const token = (sub, exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify({ sub, exp }))}.signature`;
const changed = (key) => window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('switches account when another tab changes the stored session', () => {
  localStorage.setItem('auth_token', token('account-a'));
  localStorage.setItem('user_data', JSON.stringify({ sub: 'account-a', picture: 'account-a.png' }));
  const { result } = renderHook(useAuth);
  expect(result.current.user.sub).toBe('account-a');
  act(() => { localStorage.setItem('auth_token', token('account-b')); changed('auth_token'); });
  expect(result.current.user.sub).toBe('account-b');
  expect(result.current.user.picture).toBeUndefined();
  expect(result.current.isLoggedIn).toBe(true);
});

it('clears the displayed identity after logout or storage clear in another tab', () => {
  localStorage.setItem('auth_token', token('account-a'));
  const { result } = renderHook(useAuth);
  act(() => { localStorage.clear(); changed(null); });
  expect(result.current.user).toBeNull();
  expect(result.current.isLoggedIn).toBe(false);
});

it('rejects an expired token received from another tab', () => {
  const { result } = renderHook(useAuth);
  act(() => { localStorage.setItem('auth_token', token('expired', 1)); changed('auth_token'); });
  expect(result.current.user).toBeNull();
  expect(result.current.isLoggedIn).toBe(false);
  expect(localStorage.getItem('auth_token')).toBeNull();
});
