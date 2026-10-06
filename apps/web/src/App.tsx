import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
import { ThemeProvider, ThemeSwitch } from './theme';
import { MaterialDetailPage, MaterialsPage, NewMaterialPage } from './Materials';
import { ReviewPage, VocabularyPage } from './Vocabulary';
import { api } from './api';
import { GrammarDetailPage, GrammarPage } from './Grammar';

function translateAuthError(code?: string, message?: string): string {
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'Неверная почта или пароль';
  if (code === 'EMAIL_NOT_VERIFIED') return 'Сначала подтверди почту.';
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
    return 'Аккаунт с такой почтой уже существует';
  if (code === 'PASSWORD_TOO_SHORT') return 'Пароль должен содержать не менее 10 символов';
  return message
    ? 'Не удалось выполнить действие. Проверь данные и попробуй ещё раз.'
    : 'Не удалось связаться с сервером. Попробуй ещё раз.';
}

async function getLocalVerificationLink(email: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/dev/verification-link?email=${encodeURIComponent(email)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

function BusyScreen() {
  return (
    <div className="busy-screen" role="status">
      Загружаем Lingvoteka…
    </div>
  );
}

function RequireSession() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <BusyScreen />;
  return data?.user ? <Outlet /> : <Navigate to="/login" replace />;
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
        <ThemeSwitch compact />
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
      <footer className="quiet-footer">Материалы, слова и практика — в одном месте.</footer>
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

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNeedsVerification(false);
    setVerificationLink(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(translateAuthError(result.error.code, result.error.message));
        if (result.error.code === 'EMAIL_NOT_VERIFIED') {
          setNeedsVerification(true);
          setVerificationLink(await getLocalVerificationLink(email));
        }
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError(translateAuthError());
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: window.location.origin + '/',
      });
      if (result.error) {
        setError(translateAuthError(result.error.code, result.error.message));
        return;
      }
      const link = await getLocalVerificationLink(email);
      setVerificationLink(link);
      setError(
        link
          ? 'Подтверди почту по локальной ссылке.'
          : 'Проверь почту: ссылка отправлена повторно.',
      );
    } catch {
      setError(translateAuthError());
    } finally {
      setResending(false);
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
          <Link to="/forgot-password">Забыли пароль?</Link>
        </div>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <FormMessage error={error} />
        {needsVerification && (
          <div className="verification-actions">
            {verificationLink && (
              <a href={verificationLink}>Подтвердить почту в локальном режиме</a>
            )}
            <button type="button" onClick={() => void resendVerification()} disabled={resending}>
              {resending ? 'Отправляем…' : 'Отправить ссылку повторно'}
            </button>
          </div>
        )}
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </AuthFrame>
  );
}

function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    setVerificationLink(null);
    try {
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Registration-Code': inviteCode },
        body: JSON.stringify({ name, email, password, callbackURL: window.location.origin + '/' }),
      });
      if (!response.ok) {
        const detail = (await response.json()) as { code?: string; message?: string };
        setError(
          detail.code === 'INVITE_CODE_REQUIRED'
            ? 'Неверный код приглашения'
            : translateAuthError(detail.code, detail.message),
        );
      } else {
        const link = await getLocalVerificationLink(email);
        setVerificationLink(link);
        setSuccess(
          link
            ? 'В локальном режиме письма не отправляются. Подтверди адрес по ссылке ниже.'
            : 'Проверь почту: мы отправили ссылку для подтверждения адреса.',
        );
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
        <FormMessage error={error} success={success} />
        {verificationLink && (
          <div className="verification-actions">
            <a href={verificationLink}>Подтвердить почту</a>
          </div>
        )}
        <button className="primary-button" type="submit" disabled={pending || Boolean(success)}>
          {pending ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>
    </AuthFrame>
  );
}

function ForgotPasswordPage() {
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
      description="Отправим ссылку для создания нового пароля."
      footer={<Link to="/login">Вернуться ко входу</Link>}
    >
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
    </AuthFrame>
  );
}

function ResetPasswordPage() {
  const [params] = useSearchParams();
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
          <Link to="/forgot-password">Запросить новую ссылку</Link>
        </div>
      )}
    </AuthFrame>
  );
}

const navigation = [
  { to: '/', label: 'Сегодня', end: true },
  { to: '/materials', label: 'Материалы', end: false },
  { to: '/vocabulary', label: 'Словарь', end: false },
  { to: '/grammar', label: 'Грамматика', end: false },
];

function AppShell() {
  const { data } = authClient.useSession();
  const location = useLocation();
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link className="wordmark" to="/">
          Lingvoteka<span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Основная навигация">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/profile"
          className={({ isActive }) => (isActive ? 'profile-link active' : 'profile-link')}
        >
          Профиль <span aria-hidden="true">↗</span>
        </NavLink>
      </aside>
      <div className="main-column">
        <header className="app-topbar">
          <span className="topbar-label">Моё пространство</span>
          <div className="topbar-actions">
            <ThemeSwitch compact />
            <span className="avatar" aria-label={data?.user?.name}>
              {data?.user?.name?.slice(0, 1).toLocaleUpperCase('ru') ?? 'Л'}
            </span>
          </div>
        </header>
        <main className="page-content" id="main">
          <PageMotion key={location.pathname}>
            <Outlet />
          </PageMotion>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Основная навигация на телефоне">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'mobile-nav-link active' : 'mobile-nav-link')}
          >
            {item.label}
          </NavLink>
        ))}
        <NavLink
          to="/profile"
          className={({ isActive }) => (isActive ? 'mobile-nav-link active' : 'mobile-nav-link')}
        >
          Профиль
        </NavLink>
      </nav>
    </div>
  );
}

function TodayPage() {
  const { data } = authClient.useSession();
  const firstName = data?.user?.name?.trim().split(/\s+/)[0];
  const [summary, setSummary] = useState<{ dueCount: number; newCount: number } | null>(null);
  const [materialCount, setMaterialCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    void api<{ dueCount: number; newCount: number }>('/api/reviews/queue')
      .then(setSummary)
      .catch(() => setLoadError(true));
    void api<unknown[]>('/api/materials')
      .then((items) => setMaterialCount(items.length))
      .catch(() => setLoadError(true));
  }, []);
  const available = (summary?.dueCount ?? 0) + (summary?.newCount ?? 0);
  return (
    <>
      <p className="eyebrow">СЕГОДНЯ</p>
      <h1 className="page-title">{firstName ? `Привет, ${firstName}` : 'Добро пожаловать'}</h1>
      <p className="page-lead">Твой итальянский — по одному небольшому шагу за раз.</p>
      <section className="empty-section" aria-labelledby="empty-title">
        <div className="empty-mark" aria-hidden="true">
          {available || 'L'}
        </div>
        {loadError ? (
          <div>
            <h2 id="empty-title">Не удалось загрузить план</h2>
            <p>Проверь соединение и обнови страницу.</p>
          </div>
        ) : summary === null || materialCount === null ? (
          <div>
            <h2 id="empty-title">Собираем твой план</h2>
            <p>Проверяем материалы и карточки на сегодня.</p>
          </div>
        ) : available > 0 ? (
          <div>
            <h2 id="empty-title">Карточки ждут тебя</h2>
            <p>
              {summary.dueCount} на повторение · {summary.newCount} новых слов.
            </p>
            <Link className="inline-link" to="/review">
              Начать повторение
            </Link>
          </div>
        ) : materialCount === 0 ? (
          <div>
            <h2 id="empty-title">Пока здесь тихо</h2>
            <p>Когда добавишь материалы, мы соберём из них слова и темы для практики.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить первый материал
            </Link>
          </div>
        ) : (
          <div>
            <h2 id="empty-title">На сегодня всё</h2>
            <p>Можно добавить новый материал или потренировать грамматику.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить материал
            </Link>
          </div>
        )}
      </section>
      <div className="next-steps">
        <span>ТВОЙ МАРШРУТ</span>
        <p>
          Материал <b>→</b> слова и темы <b>→</b> повторение
        </p>
      </div>
    </>
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
            <p>Адрес для входа и восстановления доступа</p>
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
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
        <Route element={<RequireSession />}>
          <Route path="review" element={<ReviewPage />} />
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="materials/new" element={<NewMaterialPage />} />
            <Route path="materials/:id" element={<MaterialDetailPage />} />
            <Route path="vocabulary" element={<VocabularyPage />} />
            <Route path="grammar" element={<GrammarPage />} />
            <Route path="grammar/:id" element={<GrammarDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
