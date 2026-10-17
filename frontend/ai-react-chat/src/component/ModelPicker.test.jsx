// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import ModelPicker from './ModelPicker';
import { LanguageProvider } from '../i18n/LanguageProvider';
const render = (element) => rtlRender(element, { wrapper: LanguageProvider });
beforeEach(() => { localStorage.setItem('xiaofu_language', 'zh'); });
afterEach(cleanup);
const options = [
  { value: 'flash', label: 'Flash', compactLabel: 'Flash', group: '通用聊天' },
  { value: 'banana', label: 'Nano Banana', compactLabel: 'Banana', group: '图片生成', imageGeneration: true },
];

it('supports choosing a model using arrow keys and Enter', () => {
  const onChange = vi.fn();
  render(<ModelPicker options={options} value="flash" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '选择 AI 模型' }));
  const list = screen.getByRole('listbox');
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('banana');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('closes on Escape without changing the selection and restores focus', () => {
  const onChange = vi.fn();
  render(<ModelPicker options={options} value="flash" onChange={onChange} />);
  const trigger = screen.getByRole('button', { name: '选择 AI 模型' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(onChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

it('dismisses the menu when clicking outside and respects disabled state', () => {
  const { rerender } = render(<ModelPicker options={options} value="flash" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '选择 AI 模型' }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
  rerender(<ModelPicker options={options} value="flash" disabled onChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: '选择 AI 模型' }).disabled).toBe(true);
});

it('explains unavailable models and blocks mouse and keyboard selection', () => {
  const onChange = vi.fn();
  const items = [options[0], { ...options[1], available: false, unavailableReason: 'PRIVATE_STORAGE_NOT_CONFIGURED' }];
  render(<ModelPicker options={items} value="flash" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '选择 AI 模型' }));
  const unavailable = screen.getByRole('option', { name: /私有图片存储尚未配置/ });
  expect(unavailable.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(unavailable);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
  expect(onChange).not.toHaveBeenCalled();
});
