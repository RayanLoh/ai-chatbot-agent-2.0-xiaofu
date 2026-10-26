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
    recoveryEnabled: 'recoveryEnabled' in props ? props.recoveryEnabled : true,
    authScopeKey: props.owner, conversationId: props.conversation,
    availableModels: models, onAuthRequired: vi.fn(), setConversationId: vi.fn(),
    onSubscriptionRequired: props.onSubscriptionRequired,
    messages, setMessages, loadConversations: vi.fn().mockResolvedValue(),
    updateConversationTitle: vi.fn().mockResolvedValue(),
  }) };
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('request isolation', () => {
  it('clears old guest recovery state and never saves or restores guest drafts', async () => {
    sessionStorage.setItem('xiaofu:pending:guest', JSON.stringify({ id: 'old', text: 'Old draft' }));
    api.generateResponse.mockRejectedValueOnce(Object.assign(new Error('Session unavailable'), { status: 503, requestNotSent: true }));
    const { result } = renderHook(setup, { initialProps: { owner: 'guest', conversation: null, recoveryEnabled: false } });
    expect(result.current.pendingRecovery).toBeNull();
    expect(sessionStorage.getItem('xiaofu:pending:guest')).toBeNull();
    await act(async () => {
      result.current.inputRef.current = { value: 'Hi', dispatchEvent: vi.fn() };
      await result.current.sendMessage();
    });
    expect(result.current.inputRef.current.value).toBe('');
    expect(result.current.pendingRecovery).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(sessionStorage.getItem('xiaofu:pending:guest')).toBeNull();
    expect(api.recoverGeneration).not.toHaveBeenCalled();
  });

  it('keeps subscriber recovery data until the subscription check finishes', () => {
    const draft = { id: 'old', text: 'Subscriber draft' };
    sessionStorage.setItem('xiaofu:pending:subscriber', JSON.stringify(draft));
    const { result, rerender } = renderHook(setup, { initialProps: { owner: 'subscriber', recoveryEnabled: null } });
    expect(sessionStorage.getItem('xiaofu:pending:subscriber')).not.toBeNull();
    rerender({ owner: 'subscriber', recoveryEnabled: true });
    expect(result.current.pendingRecovery).toEqual(draft);
  });

  it('unlocks free users after a connection failure without recovery or persisted text', async () => {
    api.generateResponse.mockRejectedValueOnce(new TypeError('Connection lost'));
    const { result } = renderHook(setup, { initialProps: { owner: 'free-user', recoveryEnabled: false } });
    await act(async () => {
      result.current.inputRef.current = { value: 'Free message' };
      await result.current.sendMessage();
    });
    expect(result.current.pendingRecovery).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(sessionStorage.getItem('xiaofu:pending:free-user')).toBeNull();
    expect(api.recoverGeneration).not.toHaveBeenCalled();
  });
  it('restores input immediately if guest authentication failed before sending', async () => {
    api.generateResponse.mockRejectedValueOnce(Object.assign(new Error('Database operation failed'), {
      status: 503, requestNotSent: true,
    }));
    const { result } = renderHook(setup, { initialProps: { owner: 'guest', conversation: null } });
    await act(async () => {
      result.current.inputRef.current = { value: 'My unsent draft', dispatchEvent: vi.fn() };
      await result.current.sendMessage();
    });
    expect(result.current.pendingRecovery).toBeNull();
    expect(result.current.inputRef.current.value).toBe('My unsent draft');
    expect(sessionStorage.getItem('xiaofu:pending:guest')).toBeNull();
    expect(api.recoverGeneration).not.toHaveBeenCalled();
  });

  it('lets the user restore an old stuck draft without automatically generating again', async () => {
    const draft = { id: 'old-request', text: 'Restore me', images: [], conversationId: null };
    sessionStorage.setItem('xiaofu:pending:guest', JSON.stringify(draft));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(setup, { initialProps: { owner: 'guest', conversation: null } });
    act(() => { result.current.inputRef.current = { value: '', dispatchEvent: vi.fn() }; result.current.restorePendingDraft(); });
    expect(result.current.pendingRecovery).toEqual(draft);
    confirm.mockReturnValue(true);
    act(() => result.current.restorePendingDraft());
    expect(result.current.pendingRecovery).toBeNull();
    expect(result.current.inputRef.current.value).toBe('Restore me');
    expect(sessionStorage.getItem('xiaofu:pending:guest')).toBeNull();
    expect(api.generateResponse).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
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
