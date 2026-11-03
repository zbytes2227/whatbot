'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from '@/app/components/ui';

const ThemeContext = createContext({ theme: 'system', setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

const themeListeners = new Set();

function subscribeTheme(callback) {
  themeListeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    themeListeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function readTheme() {
  try {
    return localStorage.getItem('theme') || 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export default function Providers({ children }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => readTheme() === 'system' && applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem('theme', next);
    } catch {}
    applyTheme(next);
    themeListeners.forEach((listener) => listener());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster
        position="bottom-right"
        gutter={10}
        toastOptions={{
          duration: 4000,
          className: '!rounded-xl !border !border-zinc-200 !bg-white !px-4 !py-3 !text-sm !text-zinc-800 !shadow-lift dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-100',
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { duration: 6000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </ThemeContext.Provider>
  );
}
