import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const themes = new Set(['light', 'dark', 'system']);
const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const readSystemTheme = () => systemQuery().matches;
const serverSystemTheme = () => false;
const subscribeSystemTheme = (notify) => {
  const query = systemQuery();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const readTheme = () => {
  try {
    const saved = localStorage.getItem('theme');
    return themes.has(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
};

export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  const systemIsDark = useSyncExternalStore(
    subscribeSystemTheme,
    readSystemTheme,
    serverSystemTheme,
  );
  const resolvedTheme =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.remove('light-theme', 'dark-theme');
    document.documentElement.classList.add(`${resolvedTheme}-theme`);
  }, [resolvedTheme]);

  useEffect(() => {
    const sync = (event) => {
      if (event.key === 'theme' || event.key === null) setTheme(readTheme());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const handleThemeChange = useCallback((next) => {
    if (!themes.has(next)) return;
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* Apply even if storage is unavailable. */
    }
  }, []);
  const toggleTheme = () =>
    handleThemeChange(resolvedTheme === 'light' ? 'dark' : 'light');

  return { theme, resolvedTheme, handleThemeChange, toggleTheme };
}
