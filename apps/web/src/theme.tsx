import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authClient } from './auth-client';

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  error: string | null;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'lingvoteka-theme';

function readTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#171717' : '#f7f7f7');
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Theme still works for this session when browser storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setLocalTheme] = useState<Theme>(readTheme);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();
    void fetch('/api/me', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить настройки');
        return response.json() as Promise<{ user: { theme: string } }>;
      })
      .then(({ user }) => {
        if (controller.signal.aborted) return;
        if (user.theme === 'light' || user.theme === 'dark') {
          applyTheme(user.theme);
          setLocalTheme(user.theme);
        }
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError('Не удалось загрузить сохранённую тему');
        }
      });
    return () => controller.abort();
  }, [session?.user?.id]);

  const setTheme = useCallback(
    async (next: Theme) => {
      const previous = readTheme();
      applyTheme(next);
      setLocalTheme(next);
      setError(null);
      if (!session?.user) return;
      try {
        const response = await fetch('/api/me/theme', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: next }),
        });
        if (!response.ok) throw new Error('save failed');
      } catch {
        applyTheme(previous);
        setLocalTheme(previous);
        setError('Не удалось сохранить тему. Попробуй ещё раз.');
      }
    },
    [session?.user],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, error }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is missing');
  return context;
}

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, error } = useTheme();
  return (
    <div className="theme-switch-wrap">
      <div className="theme-switch" role="group" aria-label="Тема оформления">
        <button
          type="button"
          className={theme === 'light' ? 'theme-option active' : 'theme-option'}
          aria-pressed={theme === 'light'}
          onClick={() => void setTheme('light')}
        >
          {compact ? 'Светлая' : 'Светлая тема'}
        </button>
        <button
          type="button"
          className={theme === 'dark' ? 'theme-option active' : 'theme-option'}
          aria-pressed={theme === 'dark'}
          onClick={() => void setTheme('dark')}
        >
          {compact ? 'Тёмная' : 'Тёмная тема'}
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
