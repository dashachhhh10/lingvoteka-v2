import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type WordWheelItem = {
  word: string;
  translation: string;
  category: string;
  example: string;
};

type Stage = { width: number; height: number };

const STEP = 42;
const EASE = 0.12;
const DRAG_UNITS = 260;
const WHEEL_UNITS = 520;
const CULL = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

function place(
  ringDegrees: number,
  drumDegrees: number,
  ringRadius: number,
  drumRadius: number,
  bow: number,
  morph: number,
) {
  const curve = -bow * (1 - Math.cos(rad(drumDegrees)));
  return (
    `translateX(${morph * curve}px)` +
    ` rotateZ(${(1 - morph) * ringDegrees}deg)` +
    ` translateY(${-(1 - morph) * ringRadius}px)` +
    ` rotateX(${morph * drumDegrees}deg)` +
    ` translateZ(${morph * drumRadius}px)`
  );
}

/** A word-card adaptation of the supplied ring-to-drum component. */
export function WordWheel({ items }: { items: WordWheelItem[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringTitleRef = useRef<HTMLDivElement>(null);
  const frontTitleRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const turn = useRef(0);
  const target = useRef(0);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    touch: boolean;
  } | null>(null);
  const interacted = useRef(false);
  const settleTimer = useRef(0);
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState<Stage>({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const last = Math.max(0, items.length - 1);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const metrics = useMemo(() => {
    const { width, height } = stage;
    const cardWidth = Math.min(height * 0.4 * 1.5, width * (width < 480 ? 0.56 : 0.42));
    const cardHeight = cardWidth / 1.5;
    const ringRadius = Math.min(cardHeight * 1.1, width * 0.29);
    const ringScale = items.length
      ? clamp((((2 * Math.PI * ringRadius) / items.length) * 0.82) / (cardWidth || 1), 0.42, 1)
      : 1;
    return {
      cardWidth,
      cardHeight,
      ringRadius,
      ringScale,
      drumRadius: cardHeight * 2.1,
      bow: cardHeight * 1.55,
      perspective: cardHeight * 3.2,
    };
  }, [stage, items.length]);

  const to = useCallback(
    (next: number) => {
      target.current = clamp(next, 0, last + 1);
    },
    [last],
  );

  useEffect(() => {
    const element = stageRef.current;
    if (!element || !items.length) return;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(
          () => {
            if (!interacted.current) to(1);
          },
          reducedMotion ? 0 : 550,
        );
      },
      { threshold: 0.45 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [items.length, reducedMotion, to]);

  useEffect(() => {
    if (!stage.height || !items.length) return;
    let frame = 0;
    let firstFrame = true;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const gap = target.current - turn.current;
      if (!firstFrame && Math.abs(gap) < 0.0005) return;
      firstFrame = false;
      turn.current =
        Math.abs(gap) < 0.0005 ? target.current : turn.current + gap * (reducedMotion ? 1 : EASE);

      const morph = clamp(turn.current, 0, 1);
      const position = Math.max(0, turn.current - 1);
      if (wheelRef.current) {
        wheelRef.current.style.transform = `translateZ(${-morph * metrics.drumRadius}px)`;
      }

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const distance = index - position;
        card.style.transform = place(
          distance * (360 / items.length),
          distance * STEP,
          metrics.ringRadius,
          metrics.drumRadius,
          metrics.bow,
          morph,
        );
        card.style.opacity = morph > 0.5 && Math.abs(distance) > CULL ? '0' : '1';
        card.style.zIndex = String(Math.round(100 - Math.abs(distance) * 2));
        const face = card.firstElementChild as HTMLElement | null;
        if (face) face.style.transform = `scale(${lerp(metrics.ringScale, 1, morph)})`;
      });

      if (ringTitleRef.current) ringTitleRef.current.style.opacity = String(1 - morph);
      if (frontTitleRef.current) frontTitleRef.current.style.opacity = String(morph);
      if (fadeRef.current) fadeRef.current.style.opacity = String(morph);
      const nearest = clamp(Math.round(position), 0, last);
      setActive((previous) => (previous === nearest ? previous : nearest));
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [items.length, last, metrics, reducedMotion, stage.height]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      interacted.current = true;
      const next =
        target.current === 0 && event.deltaY > 0 ? 1 : target.current + event.deltaY / WHEEL_UNITS;
      if (next > 0 && next < last + 1) event.preventDefault();
      to(next);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => to(Math.round(target.current)), 150);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      window.clearTimeout(settleTimer.current);
    };
  }, [last, to]);

  return (
    <section aria-label="Пример карточек слов" className="relative w-full min-w-0">
      <div className="mb-3 flex items-center justify-between gap-4 text-xs font-semibold text-muted">
        <span>Слова из урока</span>
        <span aria-live="polite">
          {String(active + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </span>
      </div>
      <div className="relative h-[430px] overflow-hidden rounded-card bg-wheel sm:h-[540px]">
        <div
          ref={stageRef}
          role="listbox"
          aria-label="Карточки итальянских слов"
          aria-activedescendant={`word-wheel-${active}`}
          tabIndex={0}
          className="absolute inset-0 cursor-grab touch-pan-y outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-olive active:cursor-grabbing"
          style={{ perspective: `${metrics.perspective}px` }}
          onPointerDown={(event) => {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              startX: event.clientX,
              startY: event.clientY,
              touch: event.pointerType === 'touch',
            };
            if (event.pointerType !== 'touch')
              event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            if (
              drag.current.touch &&
              Math.abs(event.clientX - drag.current.startX) <
                Math.abs(event.clientY - drag.current.startY)
            )
              return;
            const distance = drag.current.touch
              ? drag.current.x - event.clientX
              : drag.current.y - event.clientY;
            if (Math.abs(distance) < 2) return;
            interacted.current = true;
            to(target.current + distance / DRAG_UNITS);
            drag.current = { ...drag.current, x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => {
            drag.current = null;
            if (target.current > 0) to(Math.round(target.current));
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
              to(Math.round(target.current) + 1);
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
              to(Math.round(target.current) - 1);
            else return;
            interacted.current = true;
            event.preventDefault();
          }}
        >
          <div ref={wheelRef} className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]">
            {items.map((item, index) => (
              <div
                id={`word-wheel-${index}`}
                key={item.word}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                role="option"
                aria-selected={index === active}
                className="absolute [backface-visibility:hidden]"
                style={{
                  width: metrics.cardWidth,
                  height: metrics.cardHeight,
                  marginLeft: -metrics.cardWidth / 2,
                  marginTop: -metrics.cardHeight / 2,
                }}
              >
                <div className="flex size-full flex-col justify-between overflow-hidden rounded-card border border-line bg-surface px-[9%] py-[8%] text-ink shadow-wheel">
                  <span className="text-[clamp(9px,1vw,12px)] font-semibold uppercase tracking-[0.1em] text-olive">
                    {item.category}
                  </span>
                  <strong
                    lang="it"
                    className="break-words font-display text-[clamp(16px,2.5vw,30px)] font-semibold leading-tight tracking-tight"
                  >
                    {item.word}
                  </strong>
                  <span className="text-[clamp(10px,1.15vw,14px)] text-muted">
                    {item.translation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          ref={ringTitleRef}
          className="pointer-events-none absolute inset-0 grid place-items-center text-center font-display text-[clamp(26px,4vw,44px)] font-semibold leading-[1.05] tracking-tight text-ink"
        >
          <span>
            Parole
            <br />
            che restano<span className="text-lemon">.</span>
          </span>
        </div>
        <div
          ref={fadeRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-wheel via-wheel/90 to-transparent opacity-0"
        />
        <div
          ref={frontTitleRef}
          className="pointer-events-none absolute bottom-6 left-6 z-20 max-w-[48%] text-xs text-muted opacity-0 sm:bottom-9 sm:left-9"
        >
          <span className="block font-semibold text-ink" lang="it">
            {items[active]?.example}
          </span>
          <span className="mt-1 block">Листай слова в своём ритме</span>
        </div>
        <div className="absolute bottom-5 right-5 z-20 flex gap-2 sm:bottom-8 sm:right-8">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full bg-surface text-ink shadow-wheel transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-olive"
            onClick={() => {
              interacted.current = true;
              to(Math.max(1, Math.round(target.current)) - 1);
            }}
            aria-label="Предыдущее слово"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m14 6-6 6 6 6M8 12h12" />
            </svg>
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full bg-surface text-ink shadow-wheel transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-olive"
            onClick={() => {
              interacted.current = true;
              to(Math.round(target.current) + 1);
            }}
            aria-label="Следующее слово"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m10 6 6 6-6 6M16 12H4" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Нажимай стрелки, листай колесом мыши или проведи по карточкам.
      </p>
    </section>
  );
}
