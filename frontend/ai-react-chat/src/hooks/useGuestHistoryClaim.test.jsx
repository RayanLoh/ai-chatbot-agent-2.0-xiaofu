// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuestHistoryClaim } from './useGuestHistoryClaim';
import { requestJson } from '../api/http';
vi.mock('../api/http', () => ({ requestJson: vi.fn() }));
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); });
afterEach(cleanup);

it('does not transfer guest history for an unentitled account', () => {
  localStorage.setItem('guest_token','signed-guest');
  renderHook(() => useGuestHistoryClaim({ enabled:false, owner:'free', onClaimed:vi.fn() }));
  expect(requestJson).not.toHaveBeenCalled();
  expect(localStorage.getItem('guest_token')).toBe('signed-guest');
});

it('automatically transfers and refreshes history for a verified Pro account', async () => {
  localStorage.setItem('guest_token','signed-guest');
  requestJson.mockResolvedValue({status:'claimed',moved:2});
  const loaded=vi.fn();
  renderHook(() => useGuestHistoryClaim({ enabled:true,owner:'paid',onClaimed:loaded }));
  await waitFor(() => expect(loaded).toHaveBeenCalledOnce());
  expect(localStorage.getItem('guest_token')).toBeNull();
  expect(JSON.parse(requestJson.mock.calls[0][1].body)).toEqual({guest_token:'signed-guest'});
});

it('retains guest ownership proof after a failed transfer and allows retry', async () => {
  localStorage.setItem('guest_token','signed-guest');
  requestJson.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({status:'claimed'});
  const loaded=vi.fn();
  const {result}=renderHook(() => useGuestHistoryClaim({ enabled:true,owner:'paid',onClaimed:loaded }));
  await waitFor(() => expect(result.current.claimError).toBe(true));
  expect(localStorage.getItem('guest_token')).toBe('signed-guest');
  act(() => result.current.retryClaim());
  await waitFor(() => expect(loaded).toHaveBeenCalledOnce());
  expect(localStorage.getItem('guest_token')).toBeNull();
});

it('does not mutate the next account when an old transfer returns late', async () => {
  localStorage.setItem('guest_token','signed-guest');
  let resolve;
  requestJson.mockReturnValue(new Promise((r) => {resolve=r;}));
  const loaded=vi.fn();
  const {rerender}=renderHook(({enabled,owner}) => useGuestHistoryClaim({enabled,owner,onClaimed:loaded}),
    {initialProps:{enabled:true,owner:'first'}});
  rerender({enabled:false,owner:'second'});
  await act(async () => resolve({status:'claimed'}));
  expect(localStorage.getItem('guest_token')).toBe('signed-guest');
  expect(loaded).not.toHaveBeenCalled();
});
