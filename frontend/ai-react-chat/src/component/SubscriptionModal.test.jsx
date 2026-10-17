// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SubscriptionModal from './SubscriptionModal';
import { requestJson } from '../api/http';

vi.mock('../api/http', () => ({ requestJson: vi.fn() }));
const catalog = { free_limit: 20, free_period: 'lifetime', pro_limit: 100,
  price: '4.99', currency: 'USD', template_only: true, checkout_available: false };
const quota = { ...catalog, plan: 'free', limit: 20, used: 20, remaining: 0 };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(catalog)));
  requestJson.mockResolvedValue(quota);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows the lifetime free trial, monthly price, and disables unconfigured checkout', async () => {
  render(<SubscriptionModal isLoggedIn onClose={vi.fn()} onSignIn={vi.fn()} />);
  await screen.findByText('20 trial messages');
  expect(screen.getByText('0 of 20 messages left')).toBeTruthy();
  expect(document.querySelector('.subscription-price').textContent).toContain('USD 4.99');
  expect(screen.getByRole('button', { name: 'Subscriptions coming soon' }).disabled).toBe(true);
  expect(requestJson).not.toHaveBeenCalledWith('/billing/paypal/checkout', expect.anything());
});

it('still shows plan terms when private usage is temporarily unavailable', async () => {
  requestJson.mockRejectedValue(new Error('database offline'));
  render(<SubscriptionModal isLoggedIn onClose={vi.fn()} onSignIn={vi.fn()} />);
  await screen.findByText('20 trial messages');
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('button', { name: 'Subscriptions coming soon' }).disabled).toBe(true);
});

it('keeps payment disabled even if an API response advertises checkout', async () => {
  requestJson.mockResolvedValue({ ...quota, checkout_available: true });
  render(<SubscriptionModal isLoggedIn onClose={vi.fn()} onSignIn={vi.fn()} />);
  const button = await screen.findByRole('button', { name: 'Subscriptions coming soon' });
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(requestJson.mock.calls.every(([path]) => path === '/billing/status')).toBe(true);
});

it('offers an offline template without fabricating account usage', async () => {
  requestJson.mockRejectedValue(new Error('offline'));
  globalThis.fetch.mockRejectedValue(new Error('offline'));
  render(<SubscriptionModal isLoggedIn onClose={vi.fn()} onSignIn={vi.fn()} />);
  await screen.findByText('20 trial messages');
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Template preview only. Payments and subscription activation are not available yet.')).toBeTruthy();
});
