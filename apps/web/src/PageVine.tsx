import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

const stem =
  'M -20 122 C 120 120 250 116 340 120 C 470 130 570 143 700 133 C 820 120 930 104 1020 109 C 1130 114 1260 127 1460 116';

export function PageVine({ pathname }: { pathname: string }) {
  const trace = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    if (!trace.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap
        .timeline()
        .set(trace.current, { strokeDashoffset: 100, opacity: 0 })
        .to(trace.current, { opacity: 0.9, duration: 0.22, ease: 'power2.out' })
        .to(trace.current, { strokeDashoffset: -14, duration: 1.25, ease: 'power1.inOut' }, 0)
        .to(trace.current, { opacity: 0, duration: 0.3, ease: 'power2.out' }, 0.95);
    });
    return () => context.revert();
  }, [pathname]);

  return (
    <div className="page-vine" aria-hidden="true">
      <svg viewBox="0 0 1440 156" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g className="page-vine-stem">
          <path d={stem} />
        </g>
        <g className="page-vine-foliage page-vine-sprig page-vine-sprig-one">
          <path d="M 340 120 C 329 102 328 88 337 72" />
          <path d="M 331 103 C 313 98 307 85 316 76 C 331 81 338 94 331 103 Z" />
          <path d="M 334 96 C 348 85 360 88 366 97 C 355 107 342 105 334 96 Z" />
        </g>
        <g className="page-vine-foliage page-vine-sprig page-vine-sprig-two">
          <path d="M 700 133 C 708 112 722 99 742 89" />
          <path d="M 721 102 C 708 88 711 75 720 69 C 733 81 731 94 721 102 Z" />
          <path d="M 731 94 C 747 83 760 87 766 96 C 755 108 742 105 731 94 Z" />
        </g>
        <g className="page-vine-foliage page-vine-sprig page-vine-sprig-three">
          <path d="M 1020 109 C 1011 94 1012 78 1024 63" />
          <path d="M 1015 87 C 999 81 996 69 1004 59 C 1018 65 1024 77 1015 87 Z" />
          <path d="M 1018 79 C 1033 68 1047 71 1052 81 C 1041 91 1027 91 1018 79 Z" />
        </g>
        <g className="page-vine-foliage">
          <path d="M 535 135 C 521 119 522 106 532 100 C 542 94 550 104 544 112 C 540 117 532 114 534 109" />
          <path d="M 1245 120 C 1238 108 1243 97 1255 91" />
          <path d="M 1254 92 C 1242 82 1243 72 1250 65 C 1262 73 1264 84 1254 92 Z" />
        </g>
        <path ref={trace} className="page-vine-trace" d={stem} pathLength="100" />
      </svg>
    </div>
  );
}
