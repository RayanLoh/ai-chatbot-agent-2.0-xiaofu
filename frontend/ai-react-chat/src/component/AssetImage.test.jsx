// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AssetImage from './AssetImage';
import { fetchPrivateImage } from '../api/uploads';

vi.mock('../api/uploads', () => ({ fetchPrivateImage: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:private-image');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

it('fetches private image bytes and revokes the blob when account changes', async () => {
  fetchPrivateImage.mockResolvedValue(new Blob(['image']));
  const view = render(<AssetImage src="/assets/id" scope="one" alt="Private image" />);
  await screen.findByRole('img', { name: 'Private image' });
  expect(fetchPrivateImage).toHaveBeenCalledWith('/assets/id', expect.any(AbortSignal));
  expect(screen.getByRole('img').src).toBe('blob:private-image');
  view.rerender(<AssetImage src="/assets/id" scope="two" alt="Private image" />);
  await waitFor(() => expect(fetchPrivateImage).toHaveBeenCalledTimes(2));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-image');
});

it('never loads a legacy public image directly', () => {
  render(<AssetImage src="https://public.example/private.png" scope="one" alt="Private image" />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(fetchPrivateImage).not.toHaveBeenCalled();
});
