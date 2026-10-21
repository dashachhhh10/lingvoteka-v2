import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './liquid-morph-floating-menu.css';

export const navigation = [
  { to: '/', label: 'Сегодня', end: true },
  { to: '/materials', label: 'Материалы', end: false },
  { to: '/vocabulary', label: 'Словарь', end: false },
  { to: '/review', label: 'Карточки', end: false },
  { to: '/grammar', label: 'Грамматика', end: false },
  { to: '/profile', label: 'Профиль', end: false },
];

/** A navigation disclosure: native links, rather than application-menu roles. */
export default function FloatingMenu() {
  const { pathname } = useLocation();
  return <MenuDisclosure key={pathname} pathname={pathname} />;
}

function MenuDisclosure({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = navigation.find((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setKeyboard(true);
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className="floating-navigation fixed left-1/2 z-50 -translate-x-1/2"
      data-open={open}
      data-keyboard={keyboard}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="floating-navigation-surface relative isolate overflow-hidden border border-line shadow-wheel">
        <div className="floating-navigation-fill pointer-events-none absolute" aria-hidden="true" />
        <nav
          id={panelId}
          aria-label="Основная навигация"
          inert={!open}
          aria-hidden={!open}
          className="floating-navigation-panel relative z-10"
        >
          <div className="min-h-0 overflow-y-auto px-4">
            <p className="mb-3 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
              Твоё пространство
            </p>
            {navigation.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="floating-navigation-link flex min-h-11 items-center justify-between gap-5 rounded-xl px-3 py-2 text-lg font-medium no-underline"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span className="flex" aria-hidden="true">
                  {Array.from(item.label).map((char, charIndex) => (
                    <span key={charIndex} className="h-[1.5em] overflow-hidden">
                      <span
                        className="floating-navigation-letter flex flex-col"
                        style={{ '--letter-delay': `${charIndex * 18}ms` } as CSSProperties}
                      >
                        <span>{char}</span>
                        <span>{char}</span>
                      </span>
                    </span>
                  ))}
                </span>
                <span className="sr-only">{item.label}</span>
                <span className="floating-navigation-marker text-xs opacity-60" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </NavLink>
            ))}
            <div className="h-3" />
          </div>
        </nav>
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Закрыть меню' : `Открыть меню. ${active?.label ?? 'Разделы'}`}
          className="floating-navigation-trigger relative z-10 flex h-14 w-full items-center justify-between gap-5 border-0 bg-transparent px-6 text-sm font-semibold"
          onClick={(event) => {
            setKeyboard(event.detail === 0);
            setOpen(!open);
            if (!open && event.detail === 0) {
              requestAnimationFrame(() => container.current?.querySelector('a')?.focus());
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setKeyboard(true);
              setOpen(true);
              requestAnimationFrame(() => container.current?.querySelector('a')?.focus());
            }
          }}
        >
          <span>{open ? 'Закрыть' : (active?.label ?? 'Меню')}</span>
          <span
            className="relative flex h-6 w-6 shrink-0 items-center justify-center"
            aria-hidden="true"
          >
            <span className="floating-navigation-line absolute h-0.5 w-[18px] rounded-full bg-current" />
            <span className="floating-navigation-line absolute h-0.5 w-[18px] rounded-full bg-current" />
          </span>
        </button>
      </div>
    </div>
  );
}
