import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { ThemeSwitch } from './theme';
import { WordWheel, type WordWheelItem } from './WordWheel';

const sampleWords: WordWheelItem[] = [
  {
    word: 'il limone',
    translation: 'лимон',
    category: 'Еда и напитки',
    example: 'Un limone sul tavolo.',
  },
  {
    word: 'ricordare',
    translation: 'помнить',
    category: 'Глаголы',
    example: 'Ricordo ogni parola.',
  },
  {
    word: 'la strada',
    translation: 'улица',
    category: 'Город',
    example: 'La strada è tranquilla.',
  },
  { word: 'insieme', translation: 'вместе', category: 'Общение', example: 'Studiamo insieme.' },
  { word: 'domani', translation: 'завтра', category: 'Время', example: 'Ci vediamo domani.' },
  {
    word: 'la storia',
    translation: 'история',
    category: 'Слова из урока',
    example: 'Racconto una storia.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Собери материал',
    text: 'Загрузи PDF, презентацию, документ, скриншот или вставь текст с доски. Всё начинается с того, что было на твоём уроке.',
  },
  {
    number: '02',
    title: 'Проверь разбор',
    text: 'AI предложит слова и грамматику, покажет исходные фрагменты. Исправь или убери лишнее перед сохранением.',
  },
  {
    number: '03',
    title: 'Повторяй в свой момент',
    text: 'Слова станут карточками с интервальным повторением, а темы — короткой теорией и упражнениями.',
  },
];

export function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.from('[data-landing-reveal]', {
        y: 18,
        autoAlpha: 0,
        duration: 0.75,
        ease: 'power3.out',
        stagger: 0.09,
        clearProps: 'all',
      });
    }, pageRef);
    return () => context.revert();
  }, []);

  return (
    <div ref={pageRef} className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[78px] max-w-[1360px] items-center justify-between gap-5 px-page">
          <Link to="/" className="wordmark" aria-label="Lingvoteka, главная">
            Lingvoteka<span className="wordmark-dot">.</span>
          </Link>
          <nav
            aria-label="Навигация лендинга"
            className="hidden items-center gap-7 text-sm font-semibold text-muted sm:flex"
          >
            <a className="transition-colors hover:text-ink" href="#how-it-works">
              Как это работает
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeSwitch />
            <Link
              className="rounded-control bg-action px-4 py-2.5 text-sm font-semibold text-action-ink transition hover:brightness-95"
              to="/login"
            >
              Войти
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1360px] items-center gap-x-10 gap-y-11 px-page pb-16 pt-12 lg:min-h-[700px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-16">
          <div className="max-w-[640px]">
            <p data-landing-reveal className="mb-5 text-sm font-semibold text-olive">
              Итальянский из твоих уроков
            </p>
            <h1
              data-landing-reveal
              className="max-w-[13.5ch] font-display text-[clamp(3rem,5.3vw,5.2rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-balance"
            >
              Урок закончился.
              <br />
              <span className="text-olive">Итальянский остался.</span>
            </h1>
            <p
              data-landing-reveal
              className="mt-7 max-w-[54ch] text-[clamp(1rem,1.5vw,1.25rem)] leading-[1.7] text-muted"
            >
              Материалы, слова и грамматика больше не теряются между занятиями. Загружай то, что
              было на уроке, проверяй разбор и возвращайся к важному в нужный момент.
            </p>
            <div data-landing-reveal className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                to="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-control bg-action px-6 py-3 font-semibold text-action-ink transition hover:-translate-y-0.5 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-olive"
              >
                Войти в Lingvoteka
              </Link>
              <Link
                to="/register"
                className="text-sm font-semibold text-ink underline decoration-lemon underline-offset-4 hover:text-olive"
              >
                Создать аккаунт по приглашению
              </Link>
            </div>
            <p data-landing-reveal className="mt-8 text-sm text-muted">
              Материал → проверка → практика → повторение
            </p>
          </div>
          <div data-landing-reveal className="min-w-0">
            <WordWheel items={sampleWords} />
          </div>
        </section>

        <section id="how-it-works" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-[1360px] px-page py-20 sm:py-28">
            <div className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16">
              <h2 className="max-w-[11ch] font-display text-[clamp(2.25rem,4.5vw,4.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance">
                Один урок.
                <br />
                Много поводов вернуться.
              </h2>
              <div className="border-t border-line">
                {steps.map((step) => (
                  <div
                    key={step.number}
                    className="grid gap-3 border-b border-line py-7 sm:grid-cols-[50px_minmax(0,0.7fr)_minmax(0,1.3fr)] sm:gap-6"
                  >
                    <span className="text-sm font-semibold text-lemon">{step.number}</span>
                    <h3 className="font-display text-xl font-semibold tracking-tight">
                      {step.title}
                    </h3>
                    <p className="max-w-[52ch] text-sm leading-7 text-muted">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1360px] px-page py-20 sm:py-28">
          <div className="grid gap-10 rounded-card bg-olive-soft p-8 sm:p-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <p className="mb-4 text-sm font-semibold text-olive">Учись на своём материале</p>
              <h2 className="max-w-[16ch] font-display text-[clamp(2rem,4vw,3.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance">
                Каждое слово остаётся рядом с уроком, где ты его встретила.
              </h2>
              <p className="mt-5 max-w-[55ch] leading-7 text-muted">
                Объяснения — на русском, примеры и задания — на итальянском. Никакого заранее
                заданного уровня: содержание определяют твои уроки.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-control bg-action px-6 py-3 font-semibold text-action-ink transition hover:brightness-95"
            >
              Перейти к занятиям
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-page py-7 text-sm text-muted">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3">
          <span>Lingvoteka · итальянский из твоих уроков</span>
          <span>Сделано для занятий в своём ритме</span>
        </div>
      </footer>
    </div>
  );
}
