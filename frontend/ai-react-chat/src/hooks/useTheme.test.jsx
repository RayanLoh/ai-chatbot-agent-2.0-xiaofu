// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTheme } from './useTheme';

let query;
let listeners;
beforeEach(() => {
  localStorage.clear();
  listeners = new Set();
  query = {
    matches: false,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  };
  window.matchMedia = vi.fn(() => query);
});
afterEach(cleanup);

it('uses the saved theme on the first render and rejects invalid preferences', () => {
  localStorage.setItem('theme', 'dark');
  const { result, unmount } = renderHook(useTheme);
  expect(result.current.theme).toBe('dark');
  expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
  act(() => result.current.handleThemeChange('invalid'));
  expect(result.current.theme).toBe('dark');
  unmount();
  localStorage.setItem('theme', 'invalid');
  expect(renderHook(useTheme).result.current.theme).toBe('system');
});

it('updates system theme reactively and cleans up the media subscription', () => {
  const { result, unmount } = renderHook(useTheme);
  act(() => {
    query.matches = true;
    listeners.forEach((listener) => listener());
  });
  expect(result.current.resolvedTheme).toBe('dark');
  expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
  act(() => result.current.toggleTheme());
  expect(result.current.theme).toBe('light');
  expect(localStorage.getItem('theme')).toBe('light');
  unmount();
  expect(listeners.size).toBe(0);
});

it('synchronizes a theme change from another browser tab', () => {
  const { result } = renderHook(useTheme);
  act(() => {
    localStorage.setItem('theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
  });
  expect(result.current.theme).toBe('dark');
});
