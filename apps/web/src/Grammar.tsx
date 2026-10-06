import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';

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

export function GrammarPage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void api<TopicListItem[]>('/api/grammar')
      .then(setTopics)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);
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
        <button className="secondary-button" type="button" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Закрыть' : '+ Добавить тему'}
        </button>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {showAdd && (
        <form className="vocab-add" onSubmit={(event) => void add(event)}>
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
          <button className="primary-button form-action" type="submit" disabled={pending}>
            {pending ? 'Добавляем…' : 'Добавить тему'}
          </button>
        </form>
      )}
      <div className="vocab-toolbar">
        <label className="visually-hidden" htmlFor="grammar-search">
          Найти тему
        </label>
        <input
          id="grammar-search"
          type="search"
          placeholder="Поиск по темам"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? (
        <p className="subtle">Загружаем темы…</p>
      ) : !topics.length ? (
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
  const [topic, setTopic] = useState<Topic | null>(null);
  const [tab, setTab] = useState<'theory' | 'practice'>('theory');
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Check | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void api<Topic>(`/api/grammar/${id}`)
      .then((data) => {
        if (active) setTopic(data);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!id || topic?.theoryStatus !== 'GENERATING') return;
    const timer = window.setInterval(() => {
      void api<Topic>(`/api/grammar/${id}`)
        .then(setTopic)
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, topic?.theoryStatus]);
  async function generate() {
    if (!id) return;
    setPending(true);
    setError('');
    try {
      setTopic(await api<Topic>(`/api/grammar/${id}/generate`, { method: 'POST' }));
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
  if (loading) return <p className="subtle">Загружаем тему…</p>;
  if (!topic)
    return (
      <>
        <p className="form-message error" role="alert">
          {error || 'Тема не найдена'}
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
          type="button"
          role="tab"
          aria-selected={tab === 'theory'}
          className={tab === 'theory' ? 'active' : ''}
          onClick={() => setTab('theory')}
        >
          Теория
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'practice'}
          className={tab === 'practice' ? 'active' : ''}
          onClick={() => setTab('practice')}
        >
          Практика
        </button>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {topic.theoryError && !error && (
        <p className="form-message error" role="alert">
          {topic.theoryError}
        </p>
      )}
      {tab === 'theory' ? (
        <div className="theory-content">
          {topic.theory ? (
            <>
              <p className="ai-label">
                ✦ Объяснение создано AI. Проверяй формулировки по учебным материалам.
              </p>
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
      ) : (
        <div className="practice-content">
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
                <button className="secondary-button" type="button" onClick={() => setTab('theory')}>
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
                    <button className="text-button" type="button" onClick={() => setTab('theory')}>
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
      )}
    </>
  );
}
