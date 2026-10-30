import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { ThemeSwitch } from './theme';
import { TiltedGridHero, type TiltedGridCard } from './components/ui/tilted-grid-hero';
import { ActionLink } from './components/ui/button';

const sampleWords: TiltedGridCard[] = [
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
  const [motionPaused, setMotionPaused] = useState(false);
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
            <ActionLink to="/login">Войти</ActionLink>
          </div>
        </div>
      </header>

      <main>
        <section aria-labelledby="landing-title">
          <TiltedGridHero
            cards={sampleWords}
            paused={motionPaused}
            speed={5}
            curve={65}
            tileHeight={26}
            axis={55}
            fade={10}
            className="h-[760px] w-full [--hero-card-axis:42%] sm:h-[820px] sm:[--hero-card-axis:55%]"
          >
            <div className="relative z-10 flex h-full flex-col items-center justify-between px-page pb-9 pt-10 text-center sm:pb-12 sm:pt-12">
              <div className="max-w-[900px]">
                <p data-landing-reveal className="mb-4 text-sm font-semibold text-olive">
                  Итальянский из твоих уроков
                </p>
                <h1
                  id="landing-title"
                  data-landing-reveal
                  className="font-display text-[clamp(2.5rem,5.5vw,5rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-balance"
                >
                  Урок закончился.
                  <br />
                  <span className="text-olive">Итальянский остался.</span>
                </h1>
              </div>
              <div className="flex max-w-[600px] flex-col items-center">
                <p data-landing-reveal className="text-base leading-relaxed text-muted sm:text-lg">
                  Превращай материалы уроков в свои слова, карточки и практику. Проверяй разбор и
                  возвращайся к важному в своём ритме.
                </p>
                <div
                  data-landing-reveal
                  className="mt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6"
                >
                  <ActionLink to="/login">Войти в Lingvoteka</ActionLink>
                  <Link
                    to="/register"
                    className="text-sm font-semibold underline decoration-lemon underline-offset-4 hover:text-olive"
                  >
                    Создать аккаунт по приглашению
                  </Link>
                </div>
                <button
                  type="button"
                  aria-pressed={motionPaused}
                  onClick={() => setMotionPaused((value) => !value)}
                  className="mt-4 min-h-11 rounded-full px-4 text-xs text-muted underline underline-offset-4 motion-reduce:hidden"
                >
                  {motionPaused ? 'Продолжить движение карточек' : 'Приостановить карточки'}
                </button>
              </div>
            </div>
          </TiltedGridHero>
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
            <ActionLink to="/login">Перейти к занятиям</ActionLink>
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
