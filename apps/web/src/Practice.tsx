import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from './api';
import { ActionLink, Button, ControlIcon } from './components/ui/button';
import { SearchField } from './components/ui/fields';
import type { Check, Exercise, Topic, TopicListItem } from './grammar-types';

export function PracticePage() {
  const topicsQuery = useQuery({
    queryKey: ['grammar'],
    queryFn: () => api<TopicListItem[]>('/api/grammar'),
  });
  const [search, setSearch] = useState('');
  const topicsHeading = useRef<HTMLHeadingElement>(null);
  const topics = useMemo(
    () =>
      (topicsQuery.data ?? []).filter((topic) =>
        `${topic.title} ${topic.summary ?? ''}`
          .toLocaleLowerCase('ru')
          .includes(search.toLocaleLowerCase('ru')),
      ),
    [topicsQuery.data, search],
  );
  return (
    <>
      <p className="eyebrow">ОТ ПОНИМАНИЯ — К УВЕРЕННОСТИ</p>
      <h1 className="page-title">
        Практика<span className="wordmark-dot">.</span>
      </h1>
      <p className="page-lead max-w-2xl">
        Выбери тему и начни с заданий. Объяснение всегда рядом, если понадобится.
      </p>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <section
          className="flex flex-col items-start rounded-3xl border border-line bg-surface p-6 sm:p-8"
          aria-labelledby="practice-intro-title"
        >
          <span
            className="mb-7 grid size-11 place-items-center rounded-xl bg-lemon-soft"
            aria-hidden="true"
          >
            <svg
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 5h14v15H5zM8 2v6m8-6v6M8 12h8m-8 4h5" />
            </svg>
          </span>
          <h2 id="practice-intro-title" className="m-0 text-2xl font-medium tracking-tight">
            Немного грамматики
          </h2>
          <p className="mb-7 mt-4 max-w-md text-sm leading-relaxed text-muted">
            Короткая тренировка по теме из твоих материалов. Начать можно сразу — предварительно
            создавать объяснение не нужно.
          </p>
          <Button icon="arrow" onClick={() => topicsHeading.current?.focus()}>
            Выбрать тему
          </Button>
        </section>
        <section aria-labelledby="practice-topics-title" className="min-w-0">
          <h2
            id="practice-topics-title"
            ref={topicsHeading}
            tabIndex={-1}
            className="mb-5 mt-0 text-xl font-semibold tracking-tight"
          >
            Твои темы
          </h2>
          <SearchField
            id="practice-search"
            label="Найти тему для практики"
            placeholder="Поиск по темам"
            value={search}
            onValueChange={setSearch}
          />
          {topicsQuery.isPending ? (
            <p className="page-vine-loading mt-6 text-muted" role="status">
              Загружаем темы…
            </p>
          ) : topicsQuery.isError ? (
            <div className="mt-6" role="alert">
              <p className="text-sm text-muted">
                Не удалось загрузить темы. Проверь соединение и попробуй снова.
              </p>
              <Button variant="secondary" onClick={() => void topicsQuery.refetch()}>
                Попробовать снова
              </Button>
            </div>
          ) : !topicsQuery.data?.length ? (
            <div className="mt-6">
              <h3 className="text-lg font-medium">Начнём с темы</h3>
              <p className="text-sm leading-relaxed text-muted">
                Добавь материал и подтверди грамматические темы или создай тему вручную.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <ActionLink icon="plus" to="/materials/new">
                  Добавить материал
                </ActionLink>
                <Link
                  className="inline-flex items-center gap-2 text-sm text-olive underline underline-offset-4"
                  to="/grammar"
                >
                  Добавить тему вручную <ControlIcon name="plus" />
                </Link>
              </div>
            </div>
          ) : !topics.length ? (
            <p className="mt-6 text-sm text-muted">
              По запросу ничего не найдено. Попробуй другое название.
            </p>
          ) : (
            <div className="mt-5">
              {topics.map((topic) => (
                <article
                  key={topic.id}
                  className="flex flex-col gap-4 border-t border-line py-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <h3 className="m-0 break-words text-lg font-medium tracking-tight">
                      {topic.title}
                    </h3>
                    <p className="mb-0 mt-2 text-sm leading-relaxed text-muted">
                      {topic.summary ||
                        (topic._count.exercises
                          ? `Заданий: ${topic._count.exercises}`
                          : 'Задания подготовятся при старте')}
                    </p>
                  </div>
                  <ActionLink
                    variant="secondary"
                    className="shrink-0 self-start sm:self-center"
                    aria-label={`Начать практику: ${topic.title}`}
                    to={`/practice/${topic.id}`}
                  >
                    Начать
                  </ActionLink>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <p className="mt-10 text-sm text-muted">
        Хочешь повторить слова?{' '}
        <Link className="text-olive underline underline-offset-4" to="/review">
          Перейти к карточкам
        </Link>
      </p>
    </>
  );
}

export function PracticeTopicPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['grammar', id],
    queryFn: () => api<Topic>(`/api/grammar/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.practiceStatus === 'GENERATING' ||
      query.state.data?.theoryStatus === 'GENERATING'
        ? 2_000
        : false,
  });
  if (query.isPending)
    return (
      <p className="page-vine-loading text-muted" role="status">
        Загружаем тренировку…
      </p>
    );
  if (query.isError || !query.data)
    return (
      <>
        <Link className="back-link" to="/practice">
          ← К выбору темы
        </Link>
        <p role="alert" className="text-muted">
          {query.error instanceof Error ? query.error.message : 'Не удалось открыть тему'}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Попробовать снова
        </Button>
      </>
    );
  const topic = query.data;
  return (
    <div className="mx-auto max-w-3xl">
      <Link className="back-link" to="/practice">
        ← К выбору темы
      </Link>
      <p className="eyebrow">ГРАММАТИЧЕСКАЯ ПРАКТИКА</p>
      <h1 className="page-title break-words">{topic.title}</h1>
      {topic.summary && <p className="mt-4 text-sm leading-relaxed text-muted">{topic.summary}</p>}
      <GrammarPractice key={topic.id} topic={topic} autoStart />
    </div>
  );
}

type Answer = { exerciseId: string; correct: boolean };
export function GrammarPractice({
  topic,
  autoStart = false,
}: {
  topic: Topic;
  autoStart?: boolean;
}) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<Exercise[] | null>(() =>
    topic.exercises.length ? topic.exercises.slice(0, 5) : null,
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Check | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [pending, setPending] = useState(false);
  const [theoryPending, setTheoryPending] = useState(false);
  const [error, setError] = useState('');
  const [theoryError, setTheoryError] = useState('');
  const [retryRound, setRetryRound] = useState(false);
  const attemptedAutoStart = useRef(false);
  const answerLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const exercise = queue?.[index];
  useEffect(() => {
    if (queue === null && topic.exercises.length) setQueue(topic.exercises.slice(0, 5));
  }, [topic.exercises, queue]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index, queue]);
  async function prepare() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const updated = await api<Topic>(`/api/grammar/${topic.id}/practice`, { method: 'POST' });
      queryClient.setQueryData(['grammar', topic.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['grammar'], exact: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось подготовить задания');
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (
      autoStart &&
      !attemptedAutoStart.current &&
      !queue &&
      topic.practiceStatus !== 'GENERATING' &&
      topic.practiceStatus !== 'ERROR'
    ) {
      attemptedAutoStart.current = true;
      void prepare();
    }
  }, [autoStart, queue, topic.practiceStatus]);
  async function check() {
    if (!exercise || selected === null || answerLock.current || result) return;
    answerLock.current = true;
    setPending(true);
    setError('');
    try {
      const checked = await api<Check>(`/api/grammar/exercises/${exercise.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerIndex: selected }),
      });
      setResult(checked);
      setAnswers((current) => [...current, { exerciseId: exercise.id, correct: checked.correct }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить ответ');
    } finally {
      answerLock.current = false;
      setPending(false);
    }
  }
  async function prepareTheory() {
    if (theoryPending) return;
    setTheoryPending(true);
    setTheoryError('');
    try {
      const updated = await api<Topic>(`/api/grammar/${topic.id}/generate`, { method: 'POST' });
      queryClient.setQueryData(['grammar', topic.id], updated);
    } catch (cause) {
      setTheoryError(cause instanceof Error ? cause.message : 'Не удалось создать объяснение');
    } finally {
      setTheoryPending(false);
    }
  }
  function restart(exercises: Exercise[], retry: boolean) {
    setQueue(exercises);
    setIndex(0);
    setSelected(null);
    setResult(null);
    setAnswers([]);
    setError('');
    setRetryRound(retry);
  }
  if (!queue)
    return (
      <section
        className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8"
        aria-busy={pending || topic.practiceStatus === 'GENERATING'}
      >
        <h2 className="m-0 text-2xl font-medium tracking-tight">
          {pending || topic.practiceStatus === 'GENERATING'
            ? 'Подготавливаем задания'
            : 'Начнём тренировку?'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {topic.practiceStatus === 'GENERATING'
            ? 'Это может занять несколько минут. Можно уйти со страницы и вернуться позже.'
            : 'Создадим задания по этой теме. Предварительно создавать объяснение не нужно.'}
        </p>
        {(error || topic.practiceError) && (
          <p className="form-message error" role="alert">
            {error || topic.practiceError}
          </p>
        )}
        {topic.practiceStatus !== 'GENERATING' && (
          <Button disabled={pending} onClick={() => void prepare()}>
            {pending
              ? 'Подготавливаем…'
              : error || topic.practiceStatus === 'ERROR'
                ? 'Попробовать снова'
                : 'Начать практику'}
          </Button>
        )}
      </section>
    );
  const mistakes = queue.filter((item) =>
    answers.some((answer) => answer.exerciseId === item.id && !answer.correct),
  );
  if (!exercise)
    return (
      <section
        key={`result-${retryRound}`}
        className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8"
      >
        <p className="eyebrow">{retryRound ? 'ПОВТОР ОШИБОК ЗАВЕРШЁН' : 'ТРЕНИРОВКА ЗАВЕРШЕНА'}</p>
        <h2 ref={heading} tabIndex={-1} className="m-0 text-3xl font-medium tracking-tight">
          Ещё немного увереннее.
        </h2>
        <p
          className="mb-3 mt-6 text-5xl tracking-tight text-olive"
          aria-label={`Верных ответов: ${answers.filter((item) => item.correct).length} из ${queue.length}`}
        >
          {answers.filter((item) => item.correct).length} / {queue.length}
        </p>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {mistakes.length
            ? 'Можно отдельно вернуться к ошибкам или выбрать другую тему.'
            : 'Все ответы верные. Можно выбрать другую тему или пройти эту ещё раз.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {mistakes.length > 0 && (
            <Button onClick={() => restart(mistakes, true)}>Повторить ошибки</Button>
          )}
          <ActionLink variant="secondary" to="/practice">
            Выбрать другую тему
          </ActionLink>
          <Button variant="ghost" onClick={() => restart(topic.exercises.slice(0, 5), false)}>
            Пройти ещё раз
          </Button>
        </div>
      </section>
    );
  return (
    <div className="mt-8">
      <div className="mb-3 flex justify-between gap-4 text-sm text-muted">
        <span>
          {retryRound ? 'Повтор ошибок' : 'Задание'} {index + 1} из {queue.length}
        </span>
        <Link className="text-olive underline underline-offset-4" to="/practice">
          Закончить
        </Link>
      </div>
      <div
        role="progressbar"
        aria-label="Пройденные задания"
        aria-valuemin={0}
        aria-valuemax={queue.length}
        aria-valuenow={index}
        className="mb-7 h-1 overflow-hidden rounded-full bg-line"
      >
        <span
          className="block h-full bg-olive transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>
      <section key={exercise.id} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="eyebrow">ВЫБЕРИ ПРАВИЛЬНЫЙ ОТВЕТ</p>
        <h2
          ref={heading}
          tabIndex={-1}
          className="mb-7 mt-4 break-words text-2xl font-medium leading-snug tracking-tight sm:text-3xl"
          lang="it"
        >
          {exercise.prompt}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Варианты ответа">
          {exercise.options.map((option, optionIndex) => (
            <button
              key={optionIndex}
              type="button"
              aria-pressed={selected === optionIndex}
              disabled={pending || Boolean(result)}
              onClick={() => setSelected(optionIndex)}
              className={`min-h-12 rounded-2xl border px-5 py-4 text-left text-base transition-colors motion-reduce:transition-none disabled:cursor-default ${selected === optionIndex ? 'border-olive bg-olive-soft text-ink' : 'border-line bg-transparent text-ink enabled:hover:border-olive'}`}
              lang="it"
            >
              {option}
            </button>
          ))}
        </div>
        {result && (
          <div
            className={`mt-6 rounded-2xl p-5 ${result.correct ? 'bg-olive-soft' : 'bg-lemon-soft'}`}
            role="status"
          >
            <strong className="font-semibold">{result.correct ? 'Верно' : 'Пока не так'}</strong>
            <p className="mb-0 mt-2 text-sm leading-relaxed">
              {!result.correct && (
                <>
                  Правильный ответ: <b lang="it">{result.answer}</b>.{' '}
                </>
              )}
              {result.explanation}
            </p>
          </div>
        )}
        <details className="mt-6 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-olive underline underline-offset-4">
            Посмотреть правило
          </summary>
          {topic.theory ? (
            <div className="space-y-4 leading-relaxed text-muted">
              <p>{topic.theory.when}</p>
              <p>{topic.theory.formation}</p>
              {topic.theory.examples.map((example, i) => (
                <p key={i}>
                  <span className="block text-ink" lang="it">
                    {example.italian}
                  </span>
                  {example.russian}
                </p>
              ))}
              <Link className="text-olive underline underline-offset-4" to={`/grammar/${topic.id}`}>
                Вся теория по теме
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-muted">
                {topic.theoryStatus === 'GENERATING'
                  ? 'Создаём объяснение… Практику можно продолжать.'
                  : 'Объяснение ещё не создано. Это не мешает продолжать тренировку.'}
              </p>
              {topic.theoryStatus !== 'GENERATING' && (
                <Button
                  variant="secondary"
                  disabled={theoryPending}
                  onClick={() => void prepareTheory()}
                >
                  {theoryPending ? 'Создаём…' : 'Создать объяснение'}
                </Button>
              )}
              {(theoryError || topic.theoryError) && (
                <p role="alert" className="text-muted">
                  {theoryError || topic.theoryError}
                </p>
              )}
            </div>
          )}
        </details>
      </section>
      {error && (
        <p role="alert" className="form-message error">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end">
        {result ? (
          <Button
            icon="arrow"
            onClick={() => {
              setIndex((current) => current + 1);
              setSelected(null);
              setResult(null);
              setError('');
            }}
          >
            {index + 1 === queue.length ? 'Посмотреть результат' : 'Следующее задание'}
          </Button>
        ) : (
          <Button disabled={selected === null || pending} onClick={() => void check()}>
            {pending ? 'Проверяем…' : 'Проверить ответ'}
          </Button>
        )}
      </div>
    </div>
  );
}
