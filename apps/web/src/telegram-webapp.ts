export type TelegramWebApp = {
  initData: string;
  colorScheme: 'light' | 'dark';
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  onEvent(event: string, callback: () => void): void;
  offEvent(event: string, callback: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp() {
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : null;
}

export function isTelegramLaunch() {
  return (
    Boolean(getTelegramWebApp()) || new URLSearchParams(location.hash.slice(1)).has('tgWebAppData')
  );
}

let sdkPromise: Promise<TelegramWebApp | null> | undefined;
export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (!isTelegramLaunch()) return Promise.resolve(null);
  const app = getTelegramWebApp();
  if (app) return Promise.resolve(app);
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(
      () => reject(new Error('Не удалось подключиться к Telegram.')),
      8000,
    );
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = () => {
      clearTimeout(timeout);
      const loaded = getTelegramWebApp();
      if (loaded) resolve(loaded);
      else reject(new Error('Открой приложение кнопкой в Telegram-боте.'));
    };
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Не удалось подключиться к Telegram.'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function notifyTelegramTheme() {
  window.dispatchEvent(new Event('lingvoteka:telegram-theme'));
}
