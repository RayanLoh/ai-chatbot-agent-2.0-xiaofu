// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LoginModal from './LoginModal';

let googleSuccess;
vi.mock('@react-oauth/google', () => ({ GoogleLogin: ({ onSuccess }) => {
  googleSuccess = onSuccess;
  return <iframe title="Google sign-in" />;
} }));
vi.mock('jwt-decode', () => ({ jwtDecode: () => ({ sub: 'test-user' }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('waits for the Google frame before revealing it and provides a retry after timeout', async () => {
  vi.useFakeTimers();
  render(<LoginModal enabled onClose={vi.fn()} onLoginSuccess={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Loading sign-in');
  act(() => vi.advanceTimersByTime(12000));
  expect(screen.getByRole('status').textContent).toContain('longer than expected');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => {});
  fireEvent.load(screen.getByTitle('Google sign-in'));
  act(() => vi.advanceTimersByTime(650));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByTitle('Google sign-in').parentElement.hasAttribute('inert')).toBe(false);
});

it('shows a transition before handing off credentials and cancels it when dismissed', () => {
  vi.useFakeTimers();
  const success = vi.fn();
  const view = render(<LoginModal enabled onClose={vi.fn()} onLoginSuccess={success} />);
  act(() => googleSuccess({ credential: 'test-token' }));
  expect(screen.getByRole('status').textContent).toContain('Opening your chat');
  expect(success).not.toHaveBeenCalled();
  view.unmount();
  act(() => vi.advanceTimersByTime(650));
  expect(success).not.toHaveBeenCalled();
});

it('hands off the credential once after the transition', () => {
  vi.useFakeTimers();
  const success = vi.fn();
  render(<LoginModal enabled onClose={vi.fn()} onLoginSuccess={success} />);
  act(() => googleSuccess({ credential: 'test-token' }));
  act(() => vi.advanceTimersByTime(650));
  expect(success).toHaveBeenCalledExactlyOnceWith({ sub: 'test-user' }, 'test-token');
});
