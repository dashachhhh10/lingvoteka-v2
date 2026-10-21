import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { Button } from './components/ui/button';
import { SearchField } from './components/ui/fields';

type TopicListItem = {
  id: string;
  title: string;
  summary: string | null;
  theoryStatus: string;
  _count: { exercises: number; materials: number };
};
type Theory = {
  when: string;
  formation: string;
  examples: { italian: string; russian: string }[];
  mistakes: string[];
};
type Topic = {
  id: string;
  title: string;
  summary: string | null;
  theory: Theory | null;
  theoryStatus: string;
  theoryError: string | null;
  materials: { sourceExcerpt: string | null; material: { id: string; title: string } }[];
  exercises: { id: string; position: number; prompt: string; options: string[] }[];
};
type Check = { correct: boolean; answerIndex: number; answer: string; explanation: string };
const theoryFieldClass = 'control-field';

export function GrammarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: topics = [],
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ['grammar'],
    queryFn: () => api<TopicListItem[]>('/api/grammar'),
    refetchInterval: (query) =>
      query.state.data?.some((topic) => topic.theoryStatus === 'GENERATING') ? 3_000 : false,
  });
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const displayedError = error || (loadError instanceof Error ? loadError.message : '');
  const shown = useMemo(
    () =>
      topics.filter((topic) =>
        `${topic.title} ${topic.summary ?? ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [topics, query],
  );
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const topic = await api<{ id: string }>('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary }),
      });
      void queryClient.invalidateQueries({ queryKey: ['grammar'] });
      navigate(`/grammar/${topic.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить тему');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПОНЯТЬ И ПРИМЕНИТЬ</p>
          <h1 className="page-title">Грамматика</h1>
          <p className="page-lead">
            Темы из уроков равноправны — выбирай ту, которую хочешь разобрать.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={showAdd ? 'close' : 'plus'}
          aria-expanded={showAdd}
          aria-controls="grammar-add-form"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Закрыть' : 'Добавить тему'}
        </Button>
      </div>
      {displayedError && (
        <p className="form-message error" role="alert">
          {displayedError}
        </p>
      )}
      {showAdd && (
        <form id="grammar-add-form" className="vocab-add" onSubmit={(event) => void add(event)}>
          <label>
            Название темы
            <input required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Что было на уроке <span>необязательно</span>
            <textarea
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <Button className="justify-self-start" type="submit" disabled={pending}>
            {pending ? 'Добавляем…' : 'Добавить тему'}
          </Button>
        </form>
      )}
      <div className="mt-10">
        <SearchField
          id="grammar-search"
          label="Найти тему"
          placeholder="Поиск по темам"
          value={query}
          onValueChange={setQuery}
        />
      </div>
      {loading ? (
        <p className="subtle page-vine-loading">Загружаем темы…</p>
      ) : loadError && !topics.length ? null : !topics.length ? (
        <section className="empty-section">
          <div className="empty-mark" aria-hidden="true">
            —
          </div>
          <div>
            <h2>Тем пока нет</h2>
            <p>Добавь материал с урока или создай тему вручную.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить материал
            </Link>
          </div>
        </section>
      ) : !shown.length ? (
        <p className="subtle">По запросу ничего не найдено.</p>
      ) : (
        <div className="material-list">
          {shown.map((topic) => (
            <Link key={topic.id} className="material-row" to={`/grammar/${topic.id}`}>
              <span>
                <strong>{topic.title}</strong>
                <small>{topic.summary || `${topic._count.materials} источников`}</small>
              </span>
              <span className="material-status">
                {topic.theoryStatus === 'READY'
                  ? `${topic._count.exercises} упражнения`
                  : 'Открыть тему'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function GrammarDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const {
    data: topic = null,
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ['grammar', id],
    queryFn: () => api<Topic>(`/api/grammar/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.theoryStatus === 'GENERATING' ? 3_000 : false),
  });
  const [tab, setTab] = useState<'theory' | 'practice'>('theory');
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Check | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [theoryDraft, setTheoryDraft] = useState<Theory | null>(null);
  const theoryTabRef = useRef<HTMLButtonElement>(null);
  const practiceTabRef = useRef<HTMLButtonElement>(null);
  const editTheoryButtonRef = useRef<HTMLButtonElement>(null);
  const displayedError = error || (loadError instanceof Error ? loadError.message : '');
  useEffect(() => {
    setTheoryDraft(null);
  }, [id]);
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextTab: 'theory' | 'practice';
    if (event.key === 'Home') nextTab = 'theory';
    else if (event.key === 'End') nextTab = 'practice';
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
      nextTab = tab === 'theory' ? 'practice' : 'theory';
    else return;
    event.preventDefault();
    setTab(nextTab);
    (nextTab === 'theory' ? theoryTabRef : practiceTabRef).current?.focus();
  }
  async function generate() {
    if (!id) return;
    setPending(true);
    setError('');
    try {
      const generated = await api<Topic>(`/api/grammar/${id}/generate`, { method: 'POST' });
      queryClient.setQueryData(['grammar', id], generated);
      void queryClient.invalidateQueries({ queryKey: ['grammar'], exact: true });
      setExerciseIndex(0);
      setResult(null);
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать объяснение');
    } finally {
      setPending(false);
    }
  }
  async function check() {
    const exercise = topic?.exercises[exerciseIndex];
    if (!exercise || selected === null) return;
    setPending(true);
    setError('');
    try {
      setResult(
        await api<Check>(`/api/grammar/exercises/${exercise.id}/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answerIndex: selected }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ответ');
    } finally {
      setPending(false);
    }
  }
  async function saveTheory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !theoryDraft) return;
    setPending(true);
    setError('');
    try {
      const updated = await api<Topic>(`/api/grammar/${id}/theory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theoryDraft),
      });
      queryClient.setQueryData(['grammar', id], updated);
      setTheoryDraft(null);
      requestAnimationFrame(() => editTheoryButtonRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить объяснение');
    } finally {
      setPending(false);
    }
  }
  if (loading) return <p className="subtle page-vine-loading">Загружаем тему…</p>;
  if (!topic)
    return (
      <>
        <p className="form-message error" role="alert">
          {displayedError || 'Тема не найдена'}
        </p>
        <Link to="/grammar">К темам</Link>
      </>
    );
  const exercise = topic.exercises[exerciseIndex];
  return (
    <>
      <Link className="back-link" to="/grammar">
        ← Все темы
      </Link>
      <p className="eyebrow">ГРАММАТИКА</p>
      <h1 className="page-title">{topic.title}</h1>
      {topic.summary && <p className="page-lead">{topic.summary}</p>}
      <div className="topic-tabs" role="tablist" aria-label="Раздел темы">
        <button
          ref={theoryTabRef}
          id="grammar-tab-theory"
          type="button"
          role="tab"
          aria-selected={tab === 'theory'}
          aria-controls="grammar-panel-theory"
          tabIndex={tab === 'theory' ? 0 : -1}
          className={tab === 'theory' ? 'active' : ''}
          onClick={() => setTab('theory')}
          onKeyDown={handleTabKeyDown}
        >
          Теория
        </button>
        <button
          ref={practiceTabRef}
          id="grammar-tab-practice"
          type="button"
          role="tab"
          aria-selected={tab === 'practice'}
          aria-controls="grammar-panel-practice"
          tabIndex={tab === 'practice' ? 0 : -1}
          className={tab === 'practice' ? 'active' : ''}
          onClick={() => setTab('practice')}
          onKeyDown={handleTabKeyDown}
        >
          Практика
        </button>
      </div>
      {displayedError && (
        <p className="form-message error" role="alert">
          {displayedError}
        </p>
      )}
      {topic.theoryError && !displayedError && (
        <p className="form-message error" role="alert">
          {topic.theoryError}
        </p>
      )}
      <>
        <div
          id="grammar-panel-theory"
          className="theory-content"
          role="tabpanel"
          aria-labelledby="grammar-tab-theory"
          tabIndex={0}
          hidden={tab !== 'theory'}
        >
          {topic.theory ? (
            <>
              <p className="ai-label">
                ✦ Исходное объяснение создано AI. Формулировки можно исправить вручную.
              </p>
              {theoryDraft ? (
                <form className="mt-5 grid gap-6" onSubmit={(event) => void saveTheory(event)}>
                  <label className="grid gap-2 font-semibold">
                    Когда используется
                    <textarea
                      className={theoryFieldClass}
                      rows={4}
                      maxLength={2000}
                      required
                      value={theoryDraft.when}
                      onChange={(event) =>
                        setTheoryDraft({ ...theoryDraft, when: event.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2 font-semibold">
                    Как образуется
                    <textarea
                      className={theoryFieldClass}
                      rows={4}
                      maxLength={2000}
                      required
                      value={theoryDraft.formation}
                      onChange={(event) =>
                        setTheoryDraft({ ...theoryDraft, formation: event.target.value })
                      }
                    />
                  </label>
                  <div className="grid gap-3">
                    <h2>Примеры</h2>
                    {theoryDraft.examples.map((example, index) => (
                      <div
                        className="grid gap-2 rounded-card border border-line bg-surface p-4"
                        key={index}
                      >
                        <label className="grid gap-1.5 text-sm font-semibold">
                          Итальянский пример {index + 1}
                          <input
                            className={theoryFieldClass}
                            lang="it"
                            maxLength={400}
                            required
                            value={example.italian}
                            onChange={(event) =>
                              setTheoryDraft({
                                ...theoryDraft,
                                examples: theoryDraft.examples.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, italian: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-semibold">
                          Перевод
                          <input
                            className={theoryFieldClass}
                            maxLength={400}
                            required
                            value={example.russian}
                            onChange={(event) =>
                              setTheoryDraft({
                                ...theoryDraft,
                                examples: theoryDraft.examples.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, russian: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        {theoryDraft.examples.length > 1 && (
                          <button
                            className="text-button justify-self-start"
                            type="button"
                            onClick={() =>
                              setTheoryDraft({
                                ...theoryDraft,
                                examples: theoryDraft.examples.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              })
                            }
                          >
                            Удалить пример
                          </button>
                        )}
                      </div>
                    ))}
                    {theoryDraft.examples.length < 4 && (
                      <button
                        className="secondary-button justify-self-start"
                        type="button"
                        onClick={() =>
                          setTheoryDraft({
                            ...theoryDraft,
                            examples: [...theoryDraft.examples, { italian: '', russian: '' }],
                          })
                        }
                      >
                        + Добавить пример
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3">
                    <h2>Частые ошибки</h2>
                    {theoryDraft.mistakes.map((mistake, index) => (
                      <div className="flex flex-wrap items-start gap-2" key={index}>
                        <label className="min-w-48 flex-1 text-sm font-semibold">
                          <span className="sr-only">Ошибка {index + 1}</span>
                          <input
                            className={theoryFieldClass}
                            maxLength={400}
                            required
                            value={mistake}
                            onChange={(event) =>
                              setTheoryDraft({
                                ...theoryDraft,
                                mistakes: theoryDraft.mistakes.map((item, itemIndex) =>
                                  itemIndex === index ? event.target.value : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          className="text-button min-h-11"
                          type="button"
                          aria-label={`Удалить ошибку ${index + 1}`}
                          onClick={() =>
                            setTheoryDraft({
                              ...theoryDraft,
                              mistakes: theoryDraft.mistakes.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    {theoryDraft.mistakes.length < 4 && (
                      <button
                        className="secondary-button justify-self-start"
                        type="button"
                        onClick={() =>
                          setTheoryDraft({
                            ...theoryDraft,
                            mistakes: [...theoryDraft.mistakes, ''],
                          })
                        }
                      >
                        + Добавить ошибку
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted">
                    Упражнения сохранятся без изменений; если правило исправлено, проверь их ответы.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button className="primary-button" type="submit" disabled={pending}>
                      {pending ? 'Сохраняем…' : 'Сохранить исправления'}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setTheoryDraft(null);
                        requestAnimationFrame(() => editTheoryButtonRef.current?.focus());
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    ref={editTheoryButtonRef}
                    className="secondary-button mt-4"
                    type="button"
                    onClick={() =>
                      setTheoryDraft({
                        ...topic.theory!,
                        examples: topic.theory!.examples.length
                          ? topic.theory!.examples.map((example) => ({ ...example }))
                          : [{ italian: '', russian: '' }],
                        mistakes: [...topic.theory!.mistakes],
                      })
                    }
                  >
                    Исправить объяснение
                  </button>
                  <section>
                    <h2>Когда используется</h2>
                    <p>{topic.theory.when}</p>
                  </section>
                  <section>
                    <h2>Как образуется</h2>
                    <p>{topic.theory.formation}</p>
                  </section>
                  <section>
                    <h2>Примеры</h2>
                    {topic.theory.examples.map((example, index) => (
                      <p className="grammar-example" key={index}>
                        <em lang="it">{example.italian}</em>
                        <span>{example.russian}</span>
                      </p>
                    ))}
                  </section>
                  <section>
                    <h2>Частые ошибки</h2>
                    <ul>
                      {topic.theory.mistakes.map((mistake, index) => (
                        <li key={index}>{mistake}</li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </>
          ) : (
            <div className="theory-placeholder">
              <h2>
                {topic.theoryStatus === 'GENERATING'
                  ? 'Создаём объяснение'
                  : 'Объяснение ещё не создано'}
              </h2>
              <p>
                {topic.theoryStatus === 'GENERATING'
                  ? 'Можно уйти со страницы и вернуться позже.'
                  : 'Сгенерируй краткую теорию и упражнения по этой теме. Текст создаёт AI; его стоит проверить.'}
              </p>
              {topic.theoryStatus !== 'GENERATING' && (
                <button
                  className="primary-button form-action"
                  type="button"
                  onClick={() => void generate()}
                  disabled={pending}
                >
                  {pending ? 'Создаём…' : 'Создать теорию и упражнения'}
                </button>
              )}
            </div>
          )}
          {topic.materials.length > 0 && (
            <section className="personal-examples">
              <h2>Из твоих материалов</h2>
              {topic.materials.map((source) => (
                <div key={source.material.id}>
                  <Link to={`/materials/${source.material.id}`}>{source.material.title} ↗</Link>
                  {source.sourceExcerpt && <p lang="it">{source.sourceExcerpt}</p>}
                </div>
              ))}
            </section>
          )}
        </div>
        <div
          id="grammar-panel-practice"
          className="practice-content"
          role="tabpanel"
          aria-labelledby="grammar-tab-practice"
          tabIndex={0}
          hidden={tab !== 'practice'}
        >
          {!exercise ? (
            topic.exercises.length && exerciseIndex >= topic.exercises.length ? (
              <div className="theory-placeholder">
                <h2>Практика завершена</h2>
                <p>Ты ответила на все задания по этой теме.</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setExerciseIndex(0);
                    setSelected(null);
                    setResult(null);
                  }}
                >
                  Пройти ещё раз
                </button>
              </div>
            ) : (
              <div className="theory-placeholder">
                <h2>Упражнений пока нет</h2>
                <p>Создай теорию, чтобы появились тренировочные задания.</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setTab('theory');
                    theoryTabRef.current?.focus();
                  }}
                >
                  Посмотреть теорию
                </button>
              </div>
            )
          ) : (
            <>
              <p className="subtle">
                Задание {exerciseIndex + 1} из {topic.exercises.length}
              </p>
              <h2 lang="it">{exercise.prompt}</h2>
              <div className="practice-options">
                {exercise.options.map((option, index) => (
                  <button
                    key={index}
                    className={selected === index ? 'selected' : ''}
                    type="button"
                    disabled={Boolean(result)}
                    onClick={() => setSelected(index)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {result ? (
                <div className="practice-result" role="status">
                  <strong>{result.correct ? '✓ Верно' : '✕ Пока не так'}</strong>
                  <p>
                    Правильный ответ: <b lang="it">{result.answer}</b>. {result.explanation}
                  </p>
                  <div className="practice-actions">
                    <button
                      className="primary-button form-action"
                      type="button"
                      onClick={() => {
                        setExerciseIndex((current) => current + 1);
                        setSelected(null);
                        setResult(null);
                      }}
                    >
                      {exerciseIndex + 1 === topic.exercises.length
                        ? 'Завершить'
                        : 'Следующее задание'}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setTab('theory');
                        theoryTabRef.current?.focus();
                      }}
                    >
                      Посмотреть правило
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="primary-button form-action"
                  type="button"
                  disabled={selected === null || pending}
                  onClick={() => void check()}
                >
                  {pending ? 'Проверяем…' : 'Проверить'}
                </button>
              )}
            </>
          )}
        </div>
      </>
    </>
  );
}
