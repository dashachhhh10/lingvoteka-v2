import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { api } from './api';
import { ActionLink, Button } from './components/ui/button';
import { SearchField, SelectField } from './components/ui/fields';

type VocabItem = {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  partOfSpeech: string | null;
  semanticTopic: string | null;
  categoryStatus: 'PENDING' | 'READY' | 'ERROR' | 'AWAITING_APPROVAL';
  reviewStates: { due: string; lastReviewedAt: string }[];
  materials: { material: { id: string; title: string; createdAt: string } }[];
};
type QueueCard = {
  id: string;
  term: string;
  translation: string;
  example: string | null;
  kind: 'new' | 'due';
};
type Queue = { dueCount: number; newCount: number; cards: QueueCard[] };
const wordCount = (count: number) =>
  `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'слово' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'слова' : 'слов'}`;

export function VocabularyPage() {
  const queryClient = useQueryClient();
  const {
    data: items = [],
    isPending: loading,
    error: loadError,
  } = useQuery({
    queryKey: ['vocabulary'],
    queryFn: () => api<VocabItem[]>('/api/vocabulary'),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.categoryStatus === 'PENDING') ? 5_000 : false,
  });
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'semanticTopic' | 'partOfSpeech'>('semanticTopic');
  const [topic, setTopic] = useState('all');
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const displayedError = error || (loadError instanceof Error ? loadError.message : '');
  const categoryOf = (item: VocabItem) =>
    item.categoryStatus === 'ERROR'
      ? 'Не удалось определить'
      : item.categoryStatus === 'AWAITING_APPROVAL'
        ? 'Пока без категории'
        : item.categoryStatus === 'PENDING'
          ? 'Определяем тему…'
          : (item[groupBy] ?? 'Другое');
  const shown = useMemo(
    () =>
      items.filter((item) =>
        `${item.term} ${item.translation}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [items, query],
  );
  const groups = useMemo(() => {
    const byTopic = new Map<string, VocabItem[]>();
    for (const item of shown) {
      const category = categoryOf(item);
      byTopic.set(category, [...(byTopic.get(category) ?? []), item]);
    }
    return [...byTopic.entries()]
      .filter(([name]) => topic === 'all' || name === topic)
      .sort(([a], [b]) => a.localeCompare(b, 'ru'))
      .map(([name, words]) => ({ id: name, title: name, items: words }));
  }, [shown, topic, groupBy]);
  const topics = useMemo(() => {
    return [...new Set(items.map(categoryOf))].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [items, groupBy]);
  useEffect(() => {
    if (topic !== 'all' && !topics.includes(topic)) setTopic('all');
  }, [topic, topics]);
  function toggleTopic(id: string) {
    setExpandedTopics((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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
      await queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
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
  async function classifyExistingCategories() {
    setError('');
    try {
      await api('/api/vocabulary/categories/classify', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось запустить определение тем');
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПРАКТИКА</p>
          <h1 className="page-title">Словарь</h1>
          <p className="page-lead">
            Слова автоматически распределяются по лексическим темам и частям речи.
          </p>
        </div>
        <ActionLink to="/review">Повторять карточки</ActionLink>
      </div>
      {displayedError && (
        <p className="form-message error" role="alert">
          {displayedError}
        </p>
      )}
      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchField
          id="vocab-search"
          label="Найти слово"
          placeholder="Поиск по слову или переводу"
          value={query}
          onValueChange={setQuery}
        />
        <Button
          variant="secondary"
          icon={showAdd ? 'close' : 'plus'}
          className="self-start sm:shrink-0"
          aria-expanded={showAdd}
          aria-controls="vocab-add-form"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Закрыть' : 'Добавить вручную'}
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3 sm:gap-4">
        <label className="grid w-full gap-2 text-xs text-muted sm:w-52" htmlFor="vocab-group-by">
          <span className="pl-4">Группировать</span>
          <SelectField
            id="vocab-group-by"
            value={groupBy}
            onChange={(event) => {
              setGroupBy(event.target.value as 'semanticTopic' | 'partOfSpeech');
              setTopic('all');
              setExpandedTopics(new Set());
            }}
          >
            <option value="semanticTopic">По темам</option>
            <option value="partOfSpeech">По частям речи</option>
          </SelectField>
        </label>
        <label className="grid w-full gap-2 text-xs text-muted sm:w-64" htmlFor="vocab-topic">
          <span className="pl-4">{groupBy === 'semanticTopic' ? 'Тема' : 'Часть речи'}</span>
          <SelectField
            id="vocab-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="all">
              {groupBy === 'semanticTopic' ? 'Все темы' : 'Все части речи'}
            </option>
            {topics.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
        </label>
        {items.some((item) => ['AWAITING_APPROVAL', 'ERROR'].includes(item.categoryStatus)) && (
          <button
            className="text-button sm:ml-auto"
            type="button"
            onClick={() => void classifyExistingCategories()}
          >
            Определить темы для слов без категории
          </button>
        )}
      </div>
      {items.some((item) => item.categoryStatus === 'AWAITING_APPROVAL') && (
        <p className="vocab-ai-note">При определении тем слова и переводы отправляются Gemini.</p>
      )}
      {showAdd && (
        <form id="vocab-add-form" className="vocab-add" onSubmit={(event) => void add(event)}>
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
          <Button className="justify-self-start" type="submit" disabled={pending}>
            {pending ? 'Добавляем…' : 'Добавить слово'}
          </Button>
        </form>
      )}
      {loading ? (
        <p className="subtle page-vine-loading">Загружаем словарь…</p>
      ) : loadError && !items.length ? null : !items.length ? (
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
      ) : !groups.length ? (
        <p className="subtle">В этой теме слова не найдены.</p>
      ) : (
        <div className="vocab-groups">
          {groups.map((group) => {
            const open = Boolean(query.trim()) || topic !== 'all' || expandedTopics.has(group.id);
            return (
              <section className="vocab-group" key={group.id}>
                {query.trim() || topic !== 'all' ? (
                  <div className="vocab-group-heading">
                    <span>{group.title}</span>
                    <span className="vocab-group-meta">{wordCount(group.items.length)}</span>
                  </div>
                ) : (
                  <button
                    className="vocab-group-heading"
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleTopic(group.id)}
                  >
                    <span>{group.title}</span>
                    <span className="vocab-group-meta">
                      {wordCount(group.items.length)}
                      <span className="vocab-group-chevron" aria-hidden="true" />
                    </span>
                  </button>
                )}
                {open && (
                  <div className="vocab-list">
                    {group.items.map((item) => (
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
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [queueAttempt, setQueueAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const ratingLock = useRef(false);
  const cardMotionRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startedAt: number;
    dragged: boolean;
  } | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<Queue>('/api/reviews/queue')
      .then((result) => {
        if (active) setQueue(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить карточки');
      });
    return () => {
      active = false;
    };
  }, [queueAttempt]);
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
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['vocabulary'] }),
      ]);
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
    if (pending || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (cardMotionRef.current) gsap.killTweensOf(cardMotionRef.current);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      dragged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
    drag.dragged = true;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && cardMotionRef.current)
      gsap.set(cardMotionRef.current, { x: dx, rotation: dx / 30 });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragged && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    ignoreClickUntilRef.current = performance.now() + 500;
    const threshold = Math.min(62, Math.max(40, event.currentTarget.clientWidth * 0.1));
    const quickSwipe = performance.now() - drag.startedAt < 320 && Math.abs(dx) >= 24;
    if (Math.abs(dx) > Math.abs(dy) * 1.15 && (Math.abs(dx) >= threshold || quickSwipe)) {
      void rate(dx > 0 ? 3 : 1, dx > 0 ? 1 : -1);
    } else {
      resetDrag();
    }
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
          error ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setError('');
                setQueueAttempt((current) => current + 1);
              }}
            >
              Попробовать снова
            </button>
          ) : (
            <p className="subtle">Подбираем карточки…</p>
          )
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
            <div className="flashcard-motion" key={card.id} ref={cardMotionRef}>
              <button
                className="flashcard-button"
                type="button"
                aria-pressed={revealed}
                aria-label={
                  revealed
                    ? `Перевод: ${card.translation}. Нажми, чтобы вернуться к слову, или смахни для оценки.`
                    : `Слово: ${card.term}. Нажми, чтобы увидеть перевод, или смахни для оценки.`
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
                    <strong>{revealed ? card.translation : ''}</strong>
                    {revealed && card.example && (
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
                <p>Смахни любую сторону ← «не помню» или «помню» →. Можно выбрать точную оценку:</p>
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
              <p className="flashcard-help">
                Нажми, чтобы увидеть перевод, или смахни карточку для оценки.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
