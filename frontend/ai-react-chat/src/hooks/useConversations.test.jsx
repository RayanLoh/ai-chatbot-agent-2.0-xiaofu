// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useConversations } from './useConversations';
import * as api from '../api';
vi.mock('../api', () => ({
  getConversations: vi.fn(), getConversationMessages: vi.fn(), createConversation: vi.fn(),
  deleteConversation: vi.fn(), updateConversationTitle: vi.fn(),
}));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); api.getConversations.mockResolvedValue({ conversations: [] }); });

it('ignores a slower previously selected conversation', async () => {
  const slow = deferred();
  api.getConversationMessages.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ messages: [{ text: 'B' }] });
  const { result } = renderHook(() => useConversations({ isMounted: true, authScopeKey: 'user:a' }));
  await waitFor(() => expect(result.current.isLoadingConversations).toBe(false));
  let first;
  act(() => { first = result.current.selectConversation('a'); });
  await act(async () => { await result.current.selectConversation('b'); });
  await act(async () => { slow.resolve({ messages: [{ text: 'A' }] }); await first; });
  expect(result.current.conversationId).toBe('b');
  expect(result.current.messages).toEqual([{ text: 'B' }]);
});

it('ignores an old account conversation list', async () => {
  const slow = deferred();
  api.getConversations.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ conversations: [{ id: 'new-owner' }] });
  const { result, rerender } = renderHook(({ owner }) => useConversations({ isMounted: true, authScopeKey: owner }),
    { initialProps: { owner: 'a' } });
  rerender({ owner: 'b' });
  await waitFor(() => expect(result.current.conversations).toEqual([{ id: 'new-owner' }]));
  await act(async () => { slow.resolve({ conversations: [{ id: 'old-owner' }] }); });
  expect(result.current.conversations).toEqual([{ id: 'new-owner' }]);
});

it('does not auto-delete conversations when loading a list', async () => {
  api.getConversations.mockResolvedValue({ conversations: [{ id: 'empty', title: 'New Conversation', message_count: 0 }] });
  const { result } = renderHook(() => useConversations({ isMounted: true, authScopeKey: 'a' }));
  await waitFor(() => expect(result.current.conversations).toHaveLength(1));
  expect(api.deleteConversation).not.toHaveBeenCalled();
});
