// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useChat } from './useChat';
import * as api from '../api';

vi.mock('../api', () => ({
  generateResponse: vi.fn(), stopGeneration: vi.fn().mockResolvedValue({}), uploadImage: vi.fn(), recoverGeneration: vi.fn(), getConversationMessages: vi.fn(),
}));
const models = ['gemini-2.5-flash'];
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

function setup(props) {
  const [messages, setMessages] = useState([]);
  return { messages, ...useChat({
    authScopeKey: props.owner, conversationId: props.conversation,
    availableModels: models, onAuthRequired: vi.fn(), setConversationId: vi.fn(),
    onSubscriptionRequired: props.onSubscriptionRequired,
    messages, setMessages, loadConversations: vi.fn().mockResolvedValue(),
    updateConversationTitle: vi.fn().mockResolvedValue(),
  }) };
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('request isolation', () => {
  it('stopping allows another message and ignores the late old response', async () => {
    const old = deferred();
    api.generateResponse.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ text: 'Second reply' });
    const { result } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    let first;
    act(() => { result.current.inputRef.current = { value: 'First' }; first = result.current.sendMessage(); });
    await act(async () => result.current.stopGenerating());
    expect(result.current.isGenerating).toBe(false);
    await act(async () => { result.current.inputRef.current.value = 'Second'; await result.current.sendMessage(); });
    await act(async () => { old.resolve({ text: 'Old reply' }); await first; });
    expect(result.current.messages.some((message) => message.text === 'Old reply')).toBe(false);
    expect(result.current.messages.some((message) => message.text === 'Second reply')).toBe(true);
    expect(result.current.messages.some((message) => message.text === 'Generation stopped.')).toBe(true);
  });

  it('does not let a previous account response reach the current account', async () => {
    const old = deferred();
    api.generateResponse.mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    let first;
    act(() => { result.current.inputRef.current = { value: 'Secret' }; first = result.current.sendMessage(); });
    rerender({ owner: 'b', conversation: 'two' });
    await act(async () => { old.resolve({ text: 'Private reply' }); await first; });
    expect(result.current.messages.some((message) => message.text === 'Private reply')).toBe(false);
    expect(result.current.isGenerating).toBe(false);
  });

  it('blocks sending while an image upload is pending', async () => {
    const pending = deferred();
    api.uploadImage.mockReturnValue(pending.promise);
    const { result } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    let uploading;
    act(() => { uploading = result.current.handleImageUpload({ target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } }); });
    await act(async () => { result.current.inputRef.current = { value: 'Image question' }; await result.current.sendMessage(); });
    expect(api.generateResponse).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ url: 'https://images.example.com/a.png' }); await uploading; });
  });

  it('recovers a lost response using the same request ID without generating twice', async () => {
    api.generateResponse.mockRejectedValueOnce(new TypeError('Network disconnected'));
    api.recoverGeneration.mockResolvedValueOnce({ text: 'Recovered reply', images: [], conversation_id: 'one' });
    const { result } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    await act(async () => {
      result.current.inputRef.current = { value: 'My question' };
      await result.current.sendMessage();
    });
    expect(api.generateResponse).toHaveBeenCalledTimes(1);
    expect(api.recoverGeneration.mock.calls[0][0]).toBe(api.generateResponse.mock.calls[0][5]);
    expect(result.current.messages.some((m) => m.text === 'Recovered reply')).toBe(true);
    expect(result.current.pendingRecovery).toBeNull();
  });

  it('restores failed input and attachments without committing another request', async () => {
    api.generateResponse.mockRejectedValueOnce(Object.assign(new Error('Budget reached'), { status: 429 }));
    const { result } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    await act(async () => {
      result.current.inputRef.current = { value: 'Keep my draft', dispatchEvent: vi.fn() };
      await result.current.sendMessage();
    });
    expect(result.current.inputRef.current.value).toBe('Keep my draft');
    expect(result.current.pendingRecovery).toBeNull();
    expect(api.recoverGeneration).not.toHaveBeenCalled();
  });

  it('persists uncertain requests across reload and blocks another paid call', async () => {
    api.generateResponse.mockRejectedValueOnce(new TypeError('offline'));
    api.recoverGeneration.mockRejectedValueOnce(new TypeError('offline'));
    const first = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    await act(async () => {
      first.result.current.inputRef.current = { value: 'Do not duplicate' };
      await first.result.current.sendMessage();
    });
    expect(first.result.current.pendingRecovery.text).toBe('Do not duplicate');
    first.unmount();
    const second = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one' } });
    expect(second.result.current.pendingRecovery.text).toBe('Do not duplicate');
    await act(async () => {
      second.result.current.inputRef.current = { value: 'Another request' };
      await second.result.current.sendMessage();
    });
    expect(api.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('opens subscription options at the free limit and restores the unsent draft', async () => {
    const upgrade = vi.fn();
    api.generateResponse.mockRejectedValueOnce(Object.assign(new Error('Upgrade to Pro to continue.'), {
      status: 402, code: 'SUBSCRIPTION_REQUIRED',
    }));
    const { result } = renderHook(setup, { initialProps: { owner: 'a', conversation: 'one', onSubscriptionRequired: upgrade } });
    await act(async () => {
      result.current.inputRef.current = { value: 'Keep this question', dispatchEvent: vi.fn() };
      await result.current.sendMessage();
    });
    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(result.current.inputRef.current.value).toBe('Keep this question');
    expect(api.recoverGeneration).not.toHaveBeenCalled();
    expect(api.generateResponse).toHaveBeenCalledTimes(1);
  });
});
