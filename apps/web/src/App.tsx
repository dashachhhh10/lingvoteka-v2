import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import gsap from 'gsap';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { authClient } from './auth-client';
import { PageMotion } from './Motion';
import { PageVine } from './PageVine';
import { ThemeProvider, ThemeSwitch } from './theme';
import { MaterialDetailPage, MaterialsPage, NewMaterialPage } from './Materials';
import { ReviewPage, VocabularyPage } from './Vocabulary';
import { api } from './api';
import { PracticePage, PracticeTopicPage } from './Practice';
import { GrammarDetailPage, GrammarPage } from './Grammar';
import { LandingPage } from './Landing';
import { ActionLink } from './components/ui/button';
import FloatingMenu from './components/ui/liquid-morph-floating-menu';
import { TelegramShell } from './Telegram';

function translateAuthError(code?: string, message?: string): string {
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'Неверная почта или пароль';
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
    return 'Аккаунт с такой почтой уже существует';
  if (code === 'PASSWORD_TOO_SHORT') return 'Пароль должен содержать не менее 10 символов';
  return message
    ? 'Не удалось выполнить действие. Проверь данные и попробуй ещё раз.'
    : 'Не удалось связаться с сервером. Попробуй ещё раз.';
}

function BusyScreen() {
  return (
    <div className="grid min-h-dvh place-items-center text-muted" role="status">
      Загружаем Lingvoteka…
    </div>
  );
}

function RequireSession() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <BusyScreen />;
  return data?.user ? (
    <AuthenticatedContent key={data.user.id} />
  ) : (
    <Navigate to="/login" replace />
  );
}

function AuthenticatedContent({ children }: { children?: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}>{children ?? <Outlet />}</QueryClientProvider>;
}

function GuestOnly() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <BusyScreen />;
  return data?.user ? <Navigate to="/" replace /> : <Outlet />;
}

function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link className="wordmark" to="/">
          Lingvoteka<span className="wordmark-dot">.</span>
        </Link>
        <ThemeSwitch />
      </header>
      <main className="auth-main">
        <PageMotion>
          <p className="eyebrow">ИТАЛЬЯНСКИЙ ИЗ ТВОИХ УРОКОВ</p>
          <h1>{title}</h1>
          <p className="intro">{description}</p>
          <div className="auth-panel">{children}</div>
          {footer && <div className="auth-footer">{footer}</div>}
        </PageMotion>
      </main>
      <footer className="px-5 pb-7 text-center text-xs text-muted">
        Материалы, слова и практика — в одном месте.
      </footer>
    </div>
  );
}

function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error)
    return (
      <p className="form-message error" role="alert">
        {error}
      </p>
    );
  if (success)
    return (
      <p className="form-message success" role="status">
        {success}
      </p>
    );
  return null;
}

function PasswordInput({
  id,
  autoComplete,
  value,
  onChange,
  minLength,
  describedBy,
}: {
  id: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}
        name="password"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        onClick={() => setVisible(!visible)}
      >
        {visible ? 'Скрыть' : 'Показать'}
      </button>
    </div>
  );
}

function usePasswordResetAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    void api<{ passwordResetAvailable: boolean }>('/api/capabilities')
      .then((result) => {
        if (mounted) setAvailable(result.passwordResetAvailable);
      })
      .catch(() => {
        if (mounted) setAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return available;
}

function LoginPage() {
  const navigate = useNavigate();
  const passwordResetAvailable = usePasswordResetAvailable();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(translateAuthError(result.error.code, result.error.message));
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError(translateAuthError());
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="С возвращением"
      description="Войди, чтобы продолжить заниматься с материалами своих уроков."
      footer={
        <>
          Ещё нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="login-email">Электронная почта</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="label-row">
          <label htmlFor="login-password">Пароль</label>
          {passwordResetAvailable && <Link to="/forgot-password">Забыли пароль?</Link>}
        </div>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <FormMessage error={error} />
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </AuthFrame>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signUp.email(
        { name, email, password },
        { headers: { 'X-Registration-Code': inviteCode } },
      );
      if (result.error) {
        setError(
          result.error.code === 'INVITE_CODE_REQUIRED'
            ? 'Неверный код приглашения'
            : translateAuthError(result.error.code, result.error.message),
        );
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError(translateAuthError());
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="Создай своё пространство"
      description="Собери слова и грамматику из уроков в одном месте."
      footer={
        <>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="register-name">Как к тебе обращаться</label>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={80}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="register-email">Электронная почта</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="register-password">Пароль</label>
        <PasswordInput
          id="register-password"
          autoComplete="new-password"
          minLength={10}
          describedBy="password-hint"
          value={password}
          onChange={setPassword}
        />
        <p id="password-hint" className="hint">
          Не менее 10 символов.
        </p>
        <label htmlFor="register-invite">
          Код приглашения <span className="optional-label">если выдан</span>
        </label>
        <input
          id="register-invite"
          name="invite"
          type="text"
          autoComplete="off"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
        />
        <FormMessage error={error} />
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>
    </AuthFrame>
  );
}

function ForgotPasswordPage() {
  const passwordResetAvailable = usePasswordResetAvailable();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: window.location.origin + '/reset-password',
      });
      if (result.error) setError(translateAuthError(result.error.code, result.error.message));
      else setSuccess('Если такой аккаунт есть, на почту придёт ссылка для сброса пароля.');
    } catch {
      setError(translateAuthError());
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="Восстановить доступ"
      description={
        passwordResetAvailable === null
          ? 'Проверяем доступность восстановления…'
          : passwordResetAvailable
            ? 'Отправим ссылку для создания нового пароля.'
            : 'Восстановление пароля временно недоступно.'
      }
      footer={<Link to="/login">Вернуться ко входу</Link>}
    >
      {passwordResetAvailable ? (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="forgot-email">Электронная почта</label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FormMessage error={error} success={success} />
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Отправляем…' : 'Отправить ссылку'}
          </button>
        </form>
      ) : null}
    </AuthFrame>
  );
}

function ResetPasswordPage() {
  const [params] = useSearchParams();
  const passwordResetAvailable = usePasswordResetAvailable();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) setError('Ссылка недействительна или истекла. Запроси новую.');
      else setSuccess('Пароль обновлён. Теперь можно войти.');
    } catch {
      setError(translateAuthError());
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame
      title="Новый пароль"
      description="Придумай новый пароль для своего аккаунта."
      footer={<Link to="/login">Вернуться ко входу</Link>}
    >
      {token ? (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="reset-password">Новый пароль</label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={setPassword}
          />
          <FormMessage error={error} success={success} />
          <button className="primary-button" type="submit" disabled={pending || Boolean(success)}>
            {pending ? 'Сохраняем…' : 'Сохранить пароль'}
          </button>
        </form>
      ) : (
        <div>
          <FormMessage error="В ссылке нет кода восстановления." />
          {passwordResetAvailable && <Link to="/forgot-password">Запросить новую ссылку</Link>}
        </div>
      )}
    </AuthFrame>
  );
}

function AppShell({ children }: { children?: ReactNode }) {
  const { data } = authClient.useSession();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-header">
        <div className="mx-auto flex min-h-[76px] w-full max-w-[1440px] items-center justify-between gap-4 px-page">
          <Link className="wordmark" to="/">
            Lingvoteka<span className="wordmark-dot">.</span>
          </Link>
          <span className="hidden text-xs tracking-wide text-muted sm:block">
            Итальянский из твоих уроков
          </span>
          <div className="header-actions">
            <ThemeSwitch />
            <NavLink
              to="/profile"
              className={({ isActive }) => (isActive ? 'account-link active' : 'account-link')}
              aria-label="Профиль"
              title="Профиль"
            >
              <span className="avatar" aria-hidden="true">
                {data?.user?.name?.slice(0, 1).toLocaleUpperCase('ru') ?? 'Л'}
              </span>
            </NavLink>
          </div>
        </div>
      </header>
      <main
        className="page-content !pb-32 focus-visible:outline-none"
        id="main"
        ref={main}
        tabIndex={-1}
      >
        <PageMotion key={pathname}>{children ?? <Outlet />}</PageMotion>
      </main>
      <PageVine />
      <FloatingMenu />
    </div>
  );
}

type TodaySummary = {
  dueCount: number;
  newCount: number;
  cards: { id: string; term: string }[];
};

function TodayCardPreview({ term }: { term: string }) {
  const preview = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!preview.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        '.today-preview-card',
        { autoAlpha: 0, y: 18, rotation: 3 },
        {
          autoAlpha: 1,
          y: 0,
          rotation: 0,
          duration: 0.42,
          delay: 0.08,
          ease: 'power3.out',
          clearProps: 'all',
        },
      );
    }, preview);
    return () => context.revert();
  }, []);

  return (
    <div className="today-preview" ref={preview}>
      <span className="today-preview-sheet today-preview-sheet-back" aria-hidden="true" />
      <span className="today-preview-sheet today-preview-sheet-middle" aria-hidden="true" />
      <Link className="today-preview-card" to="/review">
        <span className="today-preview-label">Следующее слово</span>
        <strong lang="it">{term}</strong>
        <span className="today-preview-hint">Вспомни перевод</span>
        <span className="visually-hidden">Открыть повторение</span>
      </Link>
    </div>
  );
}

function TodayPage() {
  const { data } = authClient.useSession();
  const firstName = data?.user?.name?.trim().split(/\s+/)[0];
  const queueQuery = useQuery({
    queryKey: ['reviews', 'queue'],
    queryFn: () => api<TodaySummary>('/api/reviews/queue'),
  });
  const materialsQuery = useQuery({
    queryKey: ['materials'],
    queryFn: () => api<unknown[]>('/api/materials'),
  });
  const summary = queueQuery.data ?? null;
  const materialCount = materialsQuery.data?.length ?? null;
  const loadError =
    (queueQuery.isError && !queueQuery.data) || (materialsQuery.isError && !materialsQuery.data);
  const available = (summary?.dueCount ?? 0) + (summary?.newCount ?? 0);
  return (
    <>
      <header className="mx-auto max-w-2xl pb-10 pt-6 text-center sm:pb-14 sm:pt-10">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-olive">
          Un passo alla volta · Шаг за шагом
        </p>
        <h1 className="m-0 font-display text-[clamp(52px,8vw,88px)] font-medium leading-none tracking-[-0.065em]">
          Сегодня<span className="text-lemon">.</span>
        </h1>
        <p className="mx-auto mb-0 mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
          {firstName ? `${firstName}, немного итальянского?` : 'Немного итальянского?'}
          <br />
          Твои уроки становятся словами, которые ты помнишь.
        </p>
      </header>
      <section
        className="rounded-[24px] border border-line bg-olive-soft p-6 sm:p-10"
        aria-labelledby="today-focus-title"
      >
        <p className="mb-5 mt-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-olive">
          Твой следующий шаг
        </p>
        {loadError ? (
          <div>
            <h2 id="today-focus-title" className="m-0 text-2xl font-semibold tracking-tight">
              Не удалось загрузить план
            </h2>
            <p className="text-muted">Проверь соединение и попробуй ещё раз.</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void queueQuery.refetch();
                void materialsQuery.refetch();
              }}
            >
              Попробовать снова
            </button>
          </div>
        ) : summary === null || materialCount === null ? (
          <div className="page-vine-loading" role="status">
            <h2 id="today-focus-title" className="m-0 text-2xl font-semibold tracking-tight">
              Собираем твой план
            </h2>
            <p className="text-muted">Проверяем материалы и карточки на сегодня.</p>
          </div>
        ) : available > 0 ? (
          <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto]">
            <div>
              <h2
                id="today-focus-title"
                className="m-0 text-3xl font-medium leading-tight tracking-tight sm:text-4xl"
              >
                Вспомни знакомое.
                <br />
                Выучи новое.
              </h2>
              <p className="mb-7 mt-4 text-muted">
                {summary.dueCount} на повторение · {summary.newCount} новых слов.
              </p>
              <ActionLink to="/review">Начать повторение</ActionLink>
            </div>
            {summary.cards[0]?.term && <TodayCardPreview term={summary.cards[0].term} />}
          </div>
        ) : materialCount === 0 ? (
          <div>
            <h2
              id="today-focus-title"
              className="m-0 text-3xl font-medium tracking-tight sm:text-4xl"
            >
              Всё начинается с твоего урока
            </h2>
            <p className="mb-7 mt-4 max-w-lg leading-relaxed text-muted">
              Добавь текст, файл или фото. Мы предложим слова и темы, а ты выберешь, что сохранить и
              изучать.
            </p>
            <ActionLink to="/materials/new">Добавить материал</ActionLink>
          </div>
        ) : (
          <div>
            <h2
              id="today-focus-title"
              className="m-0 text-3xl font-medium tracking-tight sm:text-4xl"
            >
              На сегодня всё
            </h2>
            <p className="mb-7 mt-4 text-muted">
              По расписанию сейчас нет слов, но любую тему можно повторить в свободной практике.
            </p>
            <ActionLink to="/review">Выбрать тему</ActionLink>
          </div>
        )}
      </section>
      <section
        className="mt-8 flex flex-col gap-5 rounded-3xl border border-line bg-lemon-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        aria-labelledby="today-practice-title"
      >
        <div>
          <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-widest text-muted">
            От правил к речи
          </p>
          <h2 id="today-practice-title" className="m-0 text-2xl font-medium tracking-tight">
            Потренируем грамматику?
          </h2>
          <p className="mb-0 mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Выбери тему и закрепи её в короткой тренировке. Объяснение можно открыть, если
            понадобится.
          </p>
        </div>
        <ActionLink className="shrink-0 self-start sm:self-center" to="/practice">
          Начать практику
        </ActionLink>
      </section>
      <section className="mt-12 sm:mt-16" aria-labelledby="today-sections-title">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-sections-title" className="m-0 text-xl font-semibold tracking-tight">
            Твоё пространство
          </h2>
          <p className="m-0 text-sm text-muted">От урока — к уверенной речи</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              to: '/materials',
              number: '01',
              label: 'Материалы',
              caption: 'С чего всё начинается',
              description: 'Уроки, заметки и файлы. Добавляй новое и разбирай в своём темпе.',
            },
            {
              to: '/vocabulary',
              number: '02',
              label: 'Словарь',
              caption: 'Слова, которые остаются',
              description: 'Всё, что ты сохранила из уроков: значения, примеры и темы.',
            },
            {
              to: '/grammar',
              number: '03',
              label: 'Грамматика',
              caption: 'Понятнее с практикой',
              description: 'Возвращайся к правилам и закрепляй их в упражнениях.',
            },
          ].map((section) => (
            <Link
              key={section.to}
              to={section.to}
              className="group rounded-[20px] border border-line bg-surface p-6 text-ink no-underline transition-colors hover:border-olive hover:bg-olive-soft"
            >
              <div className="mb-8 flex items-center justify-between text-sm text-olive">
                <span>{section.number}</span>
                <span aria-hidden="true">↗</span>
              </div>
              <p className="mb-2 text-xs text-muted">{section.caption}</p>
              <h3 className="m-0 text-2xl font-medium tracking-tight">{section.label}</h3>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted">{section.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <p className="mb-0 mt-10 text-center text-xs text-muted">Твой итальянский, в твоём ритме.</p>
    </>
  );
}

function HomeEntry() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <BusyScreen />;
  if (!data?.user) return <LandingPage />;
  return (
    <AuthenticatedContent>
      <AppShell>
        <TodayPage />
      </AppShell>
    </AuthenticatedContent>
  );
}

function ProfilePage() {
  const { data } = authClient.useSession();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) setError('Не удалось выйти. Попробуй ещё раз.');
      else navigate('/login', { replace: true });
    } catch {
      setError('Не удалось выйти. Попробуй ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="eyebrow">НАСТРОЙКИ</p>
      <h1 className="page-title">Профиль</h1>
      <p className="page-lead">Личные данные и внешний вид приложения.</p>
      <div className="settings-list">
        <section className="settings-row">
          <div>
            <h2>Имя</h2>
            <p>Как к тебе обращаться</p>
          </div>
          <strong>{data?.user?.name}</strong>
        </section>
        <section className="settings-row">
          <div>
            <h2>Почта</h2>
            <p>Адрес для входа</p>
          </div>
          <strong>{data?.user?.email}</strong>
        </section>
        <section className="settings-row">
          <div>
            <h2>Тема</h2>
            <p>Выбери светлый или тёмный интерфейс</p>
          </div>
          <ThemeSwitch />
        </section>
      </div>
      <FormMessage error={error} />
      <button
        className="text-button"
        type="button"
        disabled={pending}
        onClick={() => void signOut()}
      >
        {pending ? 'Выходим…' : 'Выйти из аккаунта'}
      </button>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <TelegramShell>
        <Routes>
          <Route index element={<HomeEntry />} />
          <Route path="welcome" element={<LandingPage />} />
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route element={<RequireSession />}>
            <Route path="review" element={<ReviewPage />} />
            <Route element={<AppShell />}>
              <Route path="materials" element={<MaterialsPage />} />
              <Route path="materials/new" element={<NewMaterialPage />} />
              <Route path="materials/:id" element={<MaterialDetailPage />} />
              <Route path="vocabulary" element={<VocabularyPage />} />
              <Route path="practice" element={<PracticePage />} />
              <Route path="practice/:id" element={<PracticeTopicPage />} />
              <Route path="grammar" element={<GrammarPage />} />
              <Route path="grammar/:id" element={<GrammarDetailPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TelegramShell>
    </ThemeProvider>
  );
}
