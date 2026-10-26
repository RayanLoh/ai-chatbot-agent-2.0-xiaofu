// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MarkdownMessage from './MarkdownMessage';

afterEach(cleanup);
it('preserves inline code, fenced code, tables and safe text rendering', () => {
  const { container } = render(
    <MarkdownMessage
      text={
        'Use `value`.\n\n```js\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>'
      }
    />,
  );
  expect(container.querySelector('p code').textContent).toBe('value');
  expect(
    container.querySelector('.code-block-wrapper pre code').textContent,
  ).toContain('const value = 1');
  expect(screen.getByRole('table')).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
});
