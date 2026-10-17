// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider, useLanguage, translate } from './LanguageProvider';
import messages from './messages.json';
import LanguageSwitcher from '../component/LanguageSwitcher';
import Footer from '../component/Footer';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function Preview() {
  const { t } = useLanguage();
  return <><LanguageSwitcher /><h1>{t('嗨，我是小芙。')}</h1><textarea aria-label="draft" defaultValue="My unfinished idea" /><Footer /></>;
}

it('defaults to English and keeps the original copyright', () => {
  render(<LanguageProvider><Preview /></LanguageProvider>);
  expect(screen.getByRole('heading').textContent).toBe('Hi, I’m Xiaofu.');
  expect(document.documentElement.lang).toBe('en');
  expect(screen.getByText(/copyright/).textContent).toBe('copyright © | rAyAnChbT | 2025 | All Rights Reserved');
});

it('switches to Chinese and Malay without losing drafts, and remembers the choice', () => {
  const view = render(<LanguageProvider><Preview /></LanguageProvider>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zh' } });
  expect(screen.getByRole('heading').textContent).toBe('嗨，我是小芙。');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ms' } });
  expect(screen.getByRole('heading').textContent).toBe('Hai, saya Xiaofu.');
  expect(screen.getByRole('textbox').value).toBe('My unfinished idea');
  expect(document.documentElement.lang).toBe('ms');
  expect(localStorage.getItem('xiaofu_language')).toBe('ms');
  view.unmount();
  render(<LanguageProvider><Preview /></LanguageProvider>);
  expect(screen.getByRole('combobox').value).toBe('ms');
  expect(screen.getByText(/copyright/).textContent).toContain('2025 | All Rights Reserved');
});

it('falls back to English for unsupported saved language values', () => {
  localStorage.setItem('xiaofu_language', 'unsupported');
  render(<LanguageProvider><Preview /></LanguageProvider>);
  expect(screen.getByRole('combobox').value).toBe('en');
});

it('includes all three translations and preserves interpolation placeholders', () => {
  for (const entry of Object.values(messages)) {
    for (const language of ['en', 'zh', 'ms']) expect(entry[language]?.trim()).toBeTruthy();
    const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
    expect(placeholders(entry.zh)).toEqual(placeholders(entry.en));
    expect(placeholders(entry.ms)).toEqual(placeholders(entry.en));
  }
  expect(translate('ms', '消息数量', { count: 3 })).toBe('3 mesej');
});
