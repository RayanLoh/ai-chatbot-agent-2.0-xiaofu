// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './i18n/LanguageProvider';
import * as api from './api';

vi.mock('./hooks/useAuth', () => ({ useAuth: () => ({
  isLoggedIn: false, isMounted: true, user: null, showLoginModal: false,
  openLoginModal: vi.fn(), closeLoginModal: vi.fn(), handleLoginSuccess: vi.fn(), handleLogout: vi.fn(),
}) }));
vi.mock('./hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), handleThemeChange: vi.fn() }) }));
vi.mock('./api', () => ({
  getModels: vi.fn(), getConversations: vi.fn(), createConversation: vi.fn(),
  getConversationMessages: vi.fn(), updateConversationTitle: vi.fn(), deleteConversation: vi.fn(),
  generateResponse: vi.fn(), stopGeneration: vi.fn().mockResolvedValue({}), uploadImage: vi.fn(), downloadImage: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); localStorage.setItem('xiaofu_language', 'zh');
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  api.getModels.mockResolvedValue([
    { value: 'flash', label: 'Flash', compactLabel: 'Flash', group: '通用聊天' },
    { value: 'banana', label: 'Banana', compactLabel: 'Banana', group: '图片生成', imageGeneration: true },
  ]);
  api.getConversations.mockResolvedValue({ conversations: [] });
});
afterEach(cleanup);

it('opens a conversation with older-page controls without undefined viewport helpers', async () => {
  localStorage.setItem('guest_token', 'returning');
  api.getConversations.mockResolvedValue({ conversations: [{ id: 'chat', title: 'History' }] });
  api.getConversationMessages.mockResolvedValue({ messages: [{ id: 'message', sender: 'user', text: 'Recent message' }], has_more: true, next_before: 50 });
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'History' }));
  expect(await screen.findByText('Recent message')).toBeTruthy();
  expect(screen.getByRole('button', { name: '加载更早消息' })).toBeTruthy();
});

it('fills the image starter without sending and selects the image model', async () => {
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /想象一幅画面/ }));
  expect(screen.getByRole('textbox', { name: '发送给小芙的消息' }).value).toContain('小猫');
  expect(screen.getByRole('button', { name: '选择 AI 模型' }).textContent).toContain('Banana');
  expect(screen.getByRole('button', { name: '发送消息' }).disabled).toBe(false);
  expect(api.generateResponse).not.toHaveBeenCalled();
});

it('does not send Enter while an IME composition is active', async () => {
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(false));
  const input = screen.getByRole('textbox', { name: '发送给小芙的消息' });
  fireEvent.input(input, { target: { value: '输入中的中文' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(api.generateResponse).not.toHaveBeenCalled();
  expect(input.value).toBe('输入中的中文');
});

it('shows a persistent retry action when history cannot load', async () => {
  localStorage.setItem('guest_token', 'returning-guest');
  api.getConversations.mockRejectedValueOnce(new Error('database internal detail'));
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await screen.findByRole('button', { name: '重新连接' });
  expect(screen.queryByText('database internal detail')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
  await waitFor(() => expect(api.getConversations).toHaveBeenCalledTimes(2));
});

it('does not request history or show a retry error for a first-time guest', async () => {
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(false));
  expect(api.getConversations).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull();
});


it('renders a reply after sending through the chat API', async () => {
  api.generateResponse.mockResolvedValue({ text: '我们可以从一个小目标开始。', images: [], conversation_id: 'one' });
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(false));
  fireEvent.input(screen.getByRole('textbox', { name: '发送给小芙的消息' }), { target: { value: '帮我想一个计划' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await screen.findByText('我们可以从一个小目标开始。');
  expect(api.generateResponse).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('heading', { name: /嗨，我是小芙/ })).toBeNull();
});


it('opens in English and keeps keyboard guidance and copyright consistent', async () => {
  localStorage.removeItem('xiaofu_language');
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await screen.findByRole('button', { name: 'Choose AI model' });
  expect(screen.getByRole('heading', { name: /Hi, I’m Xiaofu/ })).toBeTruthy();
  expect(document.querySelector('.composer-keyboard').textContent).toContain('to send');
  expect(screen.getByText(/copyright/).textContent).toBe('copyright © | rAyAnChbT | 2025 | All Rights Reserved');
});

it('disables sending when every configured model is unavailable', async () => {
  api.getModels.mockResolvedValue([{ value: 'offline', label: 'Offline', compactLabel: 'Offline', group: '通用聊天',
    available: false, unavailableReason: 'AI_NOT_CONFIGURED' }]);
  render(<MemoryRouter><LanguageProvider><App /></LanguageProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(false));
  fireEvent.input(screen.getByRole('textbox', { name: '发送给小芙的消息' }), { target: { value: 'Keep this draft' } });
  expect(screen.getByRole('button', { name: '发送消息' }).disabled).toBe(true);
  expect(api.generateResponse).not.toHaveBeenCalled();
});
