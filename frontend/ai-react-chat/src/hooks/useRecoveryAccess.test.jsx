// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestJson } from '../api/http';
import { useRecoveryAccess } from './useRecoveryAccess';

vi.mock('../api/http', () => ({ requestJson: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('does not grant guest recovery or request billing', () => {
  expect(
    renderHook(() => useRecoveryAccess({ isLoggedIn: false })).result.current,
  ).toBe(false);
  expect(requestJson).not.toHaveBeenCalled();
});

it('expires backend-verified Pro access without waiting for a reload', async () => {
  vi.useFakeTimers();
  requestJson.mockResolvedValue({
    plan: 'pro',
    valid_until: new Date(Date.now() + 1000).toISOString(),
  });
  const { result } = renderHook(() =>
    useRecoveryAccess({ isLoggedIn: true, accountId: 'a' }),
  );
  await act(async () => {});
  expect(result.current).toBe(true);
  act(() => vi.advanceTimersByTime(1001));
  expect(result.current).toBe(false);
});

it('keeps access unknown during an outage so saved drafts are not erased', async () => {
  requestJson.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() =>
    useRecoveryAccess({ isLoggedIn: true, accountId: 'a' }),
  );
  await act(async () => {});
  expect(result.current).toBeNull();
});

it('ignores the previous account billing response after switching accounts', async () => {
  let resolveOld;
  requestJson
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    )
    .mockResolvedValueOnce({ plan: 'free', valid_until: null });
  const { result, rerender } = renderHook(
    ({ accountId }) => useRecoveryAccess({ isLoggedIn: true, accountId }),
    { initialProps: { accountId: 'a' } },
  );
  const signal = requestJson.mock.calls[0][1].signal;
  rerender({ accountId: 'b' });
  await act(async () => {
    resolveOld({
      plan: 'pro',
      valid_until: new Date(Date.now() + 100000).toISOString(),
    });
  });
  expect(signal.aborted).toBe(true);
  expect(result.current).toBe(false);
});
