// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useChatViewport } from './useChatViewport';

afterEach(cleanup);
it('preserves the reading position when older messages are prepended', () => {
  window.matchMedia = vi.fn(() => ({ matches: false }));
  window.requestAnimationFrame = vi.fn(() => 1);
  window.cancelAnimationFrame = vi.fn();
  const messages = [{ text: 'recent' }];
  const { result, rerender } = renderHook(({ version, items }) => useChatViewport({
    inputRef: { current: null }, conversationId: 'chat', isLoadingMessages: false,
    messages: items, historyPrependVersion: version,
  }), { initialProps: { version: 0, items: messages } });
  const container = { scrollTop: 80, scrollHeight: 300, clientHeight: 100, scrollTo: vi.fn() };
  act(() => {
    result.current.messagesContainerRef.current = container;
    result.current.preserveHistoryPosition();
  });
  window.requestAnimationFrame.mockClear();
  container.scrollHeight = 500;
  rerender({ version: 1, items: [{ text: 'older' }, ...messages] });
  expect(container.scrollTop).toBe(280);
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  expect(container.scrollTo).not.toHaveBeenCalled();
});
