// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getModels } from './models';

afterEach(() => vi.restoreAllMocks());

it('uses backend display names and separates image models', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    models: ['gemini-nano-banana-2.1'],
    model_options: [{ value: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1',
      compactLabel: 'Banana 2.1', group: '图片生成', imageGeneration: true }],
  })));
  expect((await getModels())[0]).toMatchObject({ label: 'Nano Banana 2.1', group: '图片生成', imageGeneration: true });
});

it('keeps compatibility with older backends and respects their allowlist', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    models: ['custom-model', 'custom-model'],
    model_options: [{ value: 'not-allowed', label: 'Hidden' }],
  })));
  expect(await getModels()).toEqual([{ value: 'custom-model', label: 'custom-model',
    compactLabel: 'custom-model', group: '其他模型', imageGeneration: false }]);
});

it('rejects malformed model lists', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ models: [{}] })));
  await expect(getModels()).rejects.toThrow('Invalid model list');
});

it('preserves availability and the reason supplied by the backend', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    models: ['m'], model_options: [{ value: 'm', available: false, unavailable_reason: 'MODEL_BUDGET_NOT_CONFIGURED' }],
  })));
  expect((await getModels())[0]).toMatchObject({ available: false, unavailableReason: 'MODEL_BUDGET_NOT_CONFIGURED' });
});
