import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { Reveal } from './Motion';

type VocabItem = {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  reviewStates: { due: string; lastReviewedAt: string }[];
};
type QueueCard = {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  kind: 'new' | 'due';
};
type Queue = { dueCount: number; newCount: number; cards: QueueCard[] };

export function VocabularyPage() {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<VocabItem[]>('/api/vocabulary')
      .then(setItems)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);
  const shown = useMemo(
    () =>
      items.filter((item) =>
        `${item.term} ${item.translation}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [items, query],
  );
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, translation, example }),
      });
      setItems(await api<VocabItem[]>('/api/vocabulary'));
      setTerm('');
      setTranslation('');
      setExample('');
      setShowAdd(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить слово');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПРАКТИКА</p>
          <h1 className="page-title">Словарь</h1>
          <p className="page-lead">Слова из твоих уроков и записи, добавленные вручную.</p>
        </div>
        <Link className="action-link" to="/review">
          Повторять карточки <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      <div className="vocab-toolbar">
        <label className="visually-hidden" htmlFor="vocab-search">
          Найти слово
        </label>
        <input
          id="vocab-search"
          type="search"
          placeholder="Поиск по слову или переводу"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="secondary-button" type="button" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Закрыть' : '+ Добавить вручную'}
        </button>
      </div>
      {showAdd && (
        <form className="vocab-add" onSubmit={(event) => void add(event)}>
          <div className="form-columns">
            <label>
              По-итальянски
              <input required value={term} onChange={(event) => setTerm(event.target.value)} />
            </label>
            <label>
              Перевод
              <input
                required
                value={translation}
                onChange={(event) => setTranslation(event.target.value)}
              />
            </label>
          </div>
          <label>
            Пример <span>необязательно</span>
            <input value={example} onChange={(event) => setExample(event.target.value)} />
          </label>
          <button className="primary-button form-action" type="submit" disabled={pending}>
            {pending ? 'Добавляем…' : 'Добавить слово'}
          </button>
        </form>
      )}
      {loading ? (
        <p className="subtle">Загружаем словарь…</p>
      ) : !items.length ? (
        <section className="empty-section">
          <div className="empty-mark" aria-hidden="true">
            Aa
          </div>
          <div>
            <h2>Словарь ждёт первого слова</h2>
            <p>Добавь слово вручную или загрузи материал с урока.</p>
            <Link className="inline-link" to="/materials/new">
              Добавить материал
            </Link>
          </div>
        </section>
      ) : !shown.length ? (
        <p className="subtle">По этому запросу ничего не найдено.</p>
      ) : (
        <div className="vocab-list">
          {shown.map((item) => (
            <div className="vocab-row" key={item.id}>
              <div>
                <strong lang="it">{item.term}</strong>
                {item.example && <small lang="it">{item.example}</small>}
              </div>
              <span>{item.translation}</span>
              <small>
                {!item.reviewStates.length
                  ? 'Новое'
                  : new Date(item.reviewStates[0].due) <= new Date()
                    ? 'Пора повторить'
                    : 'На повторении'}
              </small>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const ratingLock = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Queue>('/api/reviews/queue')
      .then(setQueue)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const card = queue?.cards[index];
  async function rate(rating: number) {
    if (!card || ratingLock.current) return;
    ratingLock.current = true;
    setPending(true);
    setError('');
    try {
      await api(`/api/reviews/${card.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      setRevealed(false);
      setIndex((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить ответ');
    } finally {
      ratingLock.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (card && !revealed) setRevealed(true);
      }
      if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        void rate(Number(event.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="review-page">
      <header className="review-topbar">
        <Link className="wordmark" to="/">
          Lingvoteka<span className="wordmark-dot">.</span>
        </Link>
        <button className="text-button" type="button" onClick={() => navigate('/')}>
          Закончить ↗
        </button>
      </header>
      <main className="review-main">
        <p className="eyebrow">ПОВТОРЕНИЕ</p>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        {!queue ? (
          <p className="subtle">Подбираем карточки…</p>
        ) : !card ? (
          <div className="review-complete">
            <h1>На сегодня всё</h1>
            <p>Карточки вернутся, когда подойдёт время следующего повторения.</p>
            <Link className="action-link" to="/">
              Вернуться на главную ↗
            </Link>
          </div>
        ) : (
          <>
            <div className="review-progress">
              <span>
                {index + 1} / {queue.cards.length}
              </span>
              <span>{card.kind === 'new' ? 'Новое слово' : 'Повторение'}</span>
            </div>
            <div className="flashcard">
              <p>Вспомни перевод</p>
              <h1 lang="it">{card.term}</h1>
              {revealed && (
                <Reveal className="flashcard-answer">
                  <strong>{card.translation}</strong>
                  {card.example && <p lang="it">{card.example}</p>}
                </Reveal>
              )}
            </div>
            {!revealed ? (
              <button
                className="primary-button reveal-button"
                type="button"
                onClick={() => setRevealed(true)}
              >
                Показать ответ <span>Пробел</span>
              </button>
            ) : (
              <div className="rating-area">
                <p>Насколько легко вспомнилось?</p>
                <div className="rating-buttons">
                  <button type="button" disabled={pending} onClick={() => void rate(1)}>
                    <kbd>1</kbd> Не помню
                  </button>
                  <button type="button" disabled={pending} onClick={() => void rate(2)}>
                    <kbd>2</kbd> Трудно
                  </button>
                  <button type="button" disabled={pending} onClick={() => void rate(3)}>
                    <kbd>3</kbd> Хорошо
                  </button>
                  <button type="button" disabled={pending} onClick={() => void rate(4)}>
                    <kbd>4</kbd> Легко
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
