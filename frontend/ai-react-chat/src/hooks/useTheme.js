import { useEffect, useState } from 'react';


export function useTheme() {
  const [theme, setTheme] = useState('system');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyTheme = (themeName) => {
      document.documentElement.classList.remove('light-theme', 'dark-theme');
      document.documentElement.classList.add(`${themeName}-theme`);
    };

    let mediaQueryListener;

    if (theme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(systemIsDark.matches ? 'dark' : 'light');
      mediaQueryListener = (event) => applyTheme(event.matches ? 'dark' : 'light');
      systemIsDark.addEventListener('change', mediaQueryListener);
    } else {
      applyTheme(theme);
    }

    return () => {
      if (theme === 'system' && mediaQueryListener) {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryListener);
      }
    };
  }, [theme]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  };

  const toggleTheme = () => {
    const currentTheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    handleThemeChange(currentTheme === 'light' ? 'dark' : 'light');
  };

  return {
    theme,
    handleThemeChange,
    toggleTheme,
  };
}