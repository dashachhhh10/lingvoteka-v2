import { useLayoutEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';

export function PageMotion({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!container.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        container.current,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.22,
          ease: 'power2.out',
          clearProps: 'all',
        },
      );
    }, container);
    return () => context.revert();
  }, []);

  return <div ref={container}>{children}</div>;
}

export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!container.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        container.current!.children,
        { autoAlpha: 0, y: 6 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.2,
          ease: 'power2.out',
          stagger: 0.035,
          staggerAmount: 0.24,
          clearProps: 'all',
        },
      );
    }, container);
    return () => context.revert();
  }, []);
  return (
    <div ref={container} className={className}>
      {children}
    </div>
  );
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!container.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        container.current,
        { autoAlpha: 0, y: 5 },
        { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power2.out', clearProps: 'all' },
      );
    }, container);
    return () => context.revert();
  }, []);
  return (
    <div ref={container} className={className}>
      {children}
    </div>
  );
}
