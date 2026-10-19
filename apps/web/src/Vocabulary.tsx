import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { api } from './api';

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
  const cardMotionRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dx: number;
    moved: boolean;
  } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<Queue>('/api/reviews/queue')
      .then(setQueue)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const card = queue?.cards[index];
  useEffect(() => {
    ignoreClickUntilRef.current = 0;
  }, [card?.id]);
  async function rate(rating: number, swipeDirection?: -1 | 1) {
    if (!card || ratingLock.current) return;
    ratingLock.current = true;
    setPending(true);
    setError('');
    const motion = cardMotionRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const exit = new Promise<void>((resolve) => {
      if (!swipeDirection || !motion || reducedMotion) return resolve();
      gsap.to(motion, {
        x: swipeDirection * Math.max(window.innerWidth, 800),
        rotation: swipeDirection * 12,
        opacity: 0,
        duration: 0.22,
        ease: 'power2.in',
        onComplete: resolve,
      });
    });
    try {
      const result = await Promise.allSettled([
        exit,
        api(`/api/reviews/${card.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        }),
      ]);
      if (result[1].status === 'rejected') throw result[1].reason;
      if (motion) gsap.set(motion, { x: 0, rotation: 0, opacity: 1 });
      setRevealed(false);
      setIndex((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить ответ');
      if (motion)
        gsap.to(motion, { x: 0, rotation: 0, opacity: 1, duration: 0.2, ease: 'power2.out' });
    } finally {
      ratingLock.current = false;
      setPending(false);
    }
  }
  function resetDrag() {
    if (!cardMotionRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.to(cardMotionRef.current, { x: 0, rotation: 0, duration: 0.2, ease: 'power2.out' });
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!revealed || pending || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (cardMotionRef.current) gsap.killTweensOf(cardMotionRef.current);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    drag.dx = dx;
    drag.moved = true;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && cardMotionRef.current)
      gsap.set(cardMotionRef.current, { x: dx, rotation: dx / 30 });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;
    ignoreClickUntilRef.current = performance.now() + 500;
    const threshold = Math.max(70, Math.min(110, event.currentTarget.clientWidth * 0.18));
    if (Math.abs(drag.dx) >= threshold) void rate(drag.dx > 0 ? 3 : 1, drag.dx > 0 ? 1 : -1);
    else resetDrag();
  }
  function pointerCancel() {
    dragRef.current = null;
    resetDrag();
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]')
      )
        return;
      if (event.code === 'Space') {
        if (event.target instanceof Element && event.target.closest('button, a')) return;
        event.preventDefault();
        if (card && !pending) setRevealed((current) => !current);
      }
      if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        void rate(Number(event.key));
      }
      if (revealed && event.key === 'ArrowLeft') {
        event.preventDefault();
        void rate(1, -1);
      }
      if (revealed && event.key === 'ArrowRight') {
        event.preventDefault();
        void rate(3, 1);
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
            <div className="flashcard-motion" ref={cardMotionRef}>
              <button
                className="flashcard-button"
                type="button"
                aria-pressed={revealed}
                aria-label={
                  revealed
                    ? `Перевод: ${card.translation}. Нажми, чтобы вернуться к слову.`
                    : `Слово: ${card.term}. Нажми, чтобы увидеть перевод.`
                }
                onClick={() => {
                  if (performance.now() < ignoreClickUntilRef.current || pending) return;
                  setRevealed((current) => !current);
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerCancel}
              >
                <span className={`flashcard-inner${revealed ? ' flipped' : ''}`}>
                  <span className="flashcard-face flashcard-front" aria-hidden={revealed}>
                    <span className="flashcard-kicker">Вспомни перевод</span>
                    <strong lang="it">{card.term}</strong>
                    <span className="flashcard-tap">Нажми, чтобы перевернуть</span>
                  </span>
                  <span className="flashcard-face flashcard-back" aria-hidden={!revealed}>
                    <span className="flashcard-kicker">Перевод</span>
                    <strong>{card.translation}</strong>
                    {card.example && (
                      <span className="flashcard-example" lang="it">
                        {card.example}
                      </span>
                    )}
                    <span className="flashcard-tap">Нажми, чтобы вернуться к слову</span>
                  </span>
                </span>
              </button>
            </div>
            {revealed ? (
              <div className="rating-area">
                <p>Смахни ← «не помню» или «помню» →. Можно выбрать точную оценку:</p>
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
            ) : (
              <p className="flashcard-help">Нажми на карточку или пробел, чтобы увидеть перевод.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
