import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authClient } from './auth-client';
import { api } from './api';
import { Button, ActionLink } from './components/ui/button';
import { useTheme } from './theme';
import {
  isTelegramLaunch,
  loadTelegramWebApp,
  notifyTelegramTheme,
  type TelegramWebApp,
} from './telegram-webapp';

type Status = 'loading' | 'entry' | 'link' | 'linked' | 'conflict' | 'error';
let signInRequest: Promise<{ status: 'signed_in' | 'link_required' }> | undefined;

function telegramRequest<T>(path: string, initData: string): Promise<T> {
  return api<T>(`/api/auth/telegram/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
}

export function TelegramShell({ children }: { children: ReactNode }) {
  const [launched] = useState(isTelegramLaunch);
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!launched) return;
    let cancelled = false;
    void loadTelegramWebApp()
      .then((loaded) => {
        if (!loaded || cancelled) return;
        setApp(loaded);
        loaded.ready();
        loaded.expand();
        if (loaded.isVersionAtLeast('7.7')) loaded.disableVerticalSwipes?.();
        document.documentElement.dataset.telegram = 'true';
        notifyTelegramTheme();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Не удалось открыть Telegram.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [launched]);

  useEffect(() => {
    if (!app) return;
    const update = () => {
      const safe = app.safeAreaInset;
      const content = app.contentSafeAreaInset;
      for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
        const inset = (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(value, 200))
            : 0;
        document.documentElement.style.setProperty(
          `--telegram-safe-${edge}`,
          `${inset(safe?.[edge]) + inset(content?.[edge])}px`,
        );
      }
    };
    update();
    const themeChange = () => notifyTelegramTheme();
    app.onEvent('safeAreaChanged', update);
    app.onEvent('contentSafeAreaChanged', update);
    app.onEvent('themeChanged', themeChange);
    return () => {
      app.offEvent('safeAreaChanged', update);
      app.offEvent('contentSafeAreaChanged', update);
      app.offEvent('themeChanged', themeChange);
      delete document.documentElement.dataset.telegram;
    };
  }, [app]);

  useEffect(() => {
    if (!app) return;
    const canvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
    app.setHeaderColor(canvas);
    app.setBackgroundColor(canvas);
  }, [app, theme]);

  useEffect(() => {
    if (!app) return;
    if (location.pathname === '/') {
      app.BackButton.hide();
      return;
    }
    const back = () => {
      if (location.pathname.startsWith('/materials/')) navigate('/materials');
      else if (location.pathname.startsWith('/grammar/')) navigate('/grammar');
      else navigate('/');
    };
    app.BackButton.show();
    app.BackButton.onClick(back);
    return () => {
      app.BackButton.offClick(back);
      app.BackButton.hide();
    };
  }, [app, location.pathname, navigate]);

  useEffect(() => {
    if (!app || isPending) return;
    let cancelled = false;
    setStatus('loading');
    const check = async () => {
      if (session?.user) {
        const result = await telegramRequest<{ status: 'linked' | 'unlinked' | 'conflict' }>(
          'status',
          app.initData,
        );
        if (!cancelled) setStatus(result.status === 'unlinked' ? 'link' : result.status);
      } else {
        signInRequest ??= telegramRequest('sign-in', app.initData);
        const result = await signInRequest;
        if (cancelled) return;
        if (result.status === 'signed_in') window.location.reload();
        else setStatus('entry');
      }
    };
    void check().catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : 'Не удалось выполнить вход.');
        setStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app, session?.user?.id, isPending]);

  if (!launched || status === 'linked') return children;
  if (status === 'entry' && ['/login', '/register'].includes(location.pathname)) return children;

  const link = async () => {
    if (!app || linking) return;
    setLinking(true);
    setError('');
    try {
      await telegramRequest('link', app.initData);
      setStatus('linked');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось связать аккаунты.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6 py-12">
      <Link to="/" className="wordmark">
        Lingvoteka<span className="wordmark-dot">.</span>
      </Link>
      <p className="eyebrow">ТВОИ УРОКИ В TELEGRAM</p>
      {status === 'loading' ? (
        <p role="status">Открываем твои занятия…</p>
      ) : status === 'entry' ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Все твои слова — здесь</h1>
          <p className="text-muted">
            Если ты уже занимаешься на сайте, войди в тот же аккаунт. Материалы и прогресс останутся
            с тобой.
          </p>
          <ActionLink to="/login">Войти в свой аккаунт</ActionLink>
          <ActionLink to="/register" variant="secondary">
            Создать аккаунт
          </ActionLink>
        </>
      ) : status === 'link' ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Связать с Telegram?</h1>
          <p className="text-muted">
            Аккаунт Lingvoteka:{' '}
            <strong className="break-all text-ink">{session?.user.email}</strong>. После подключения
            ты сможешь входить в него прямо из бота.
          </p>
          <Button onClick={() => void link()} disabled={linking}>
            {linking ? 'Подключаем…' : 'Связать этот аккаунт'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void authClient.signOut().then(() => window.location.reload())}
          >
            Войти в другой аккаунт
          </Button>
        </>
      ) : status === 'conflict' ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Аккаунты уже связаны иначе</h1>
          <p className="text-muted">
            У этого Telegram или аккаунта Lingvoteka уже есть другая привязка. Выйди и выбери нужный
            аккаунт. Материалы между аккаунтами не переносятся.
          </p>
          <Button onClick={() => void authClient.signOut().then(() => window.location.reload())}>
            Сменить аккаунт
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Не удалось открыть занятия</h1>
          <Button onClick={() => window.location.reload()}>Попробовать ещё раз</Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-muted">
          {error}
        </p>
      )}
    </main>
  );
}
