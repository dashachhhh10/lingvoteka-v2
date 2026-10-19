import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

const stem =
  'M -24 141 C 94 143 169 119 265 132 S 397 158 485 139 S 625 112 720 132 S 858 159 959 132 S 1099 109 1192 133 S 1347 145 1464 119';

export function PageVine({ pathname }: { pathname: string }) {
  const trace = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    if (!trace.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap
        .timeline()
        .set(trace.current, { strokeDashoffset: 100, opacity: 0 })
        .to(trace.current, { opacity: 0.8, duration: 0.16, ease: 'power1.out' })
        .to(trace.current, { strokeDashoffset: -100, duration: 1.1, ease: 'power1.inOut' }, 0)
        .to(trace.current, { opacity: 0, duration: 0.2, ease: 'power1.out' }, 0.9);
    });
    return () => context.revert();
  }, [pathname]);

  return (
    <div className="page-vine" aria-hidden="true">
      <svg viewBox="0 0 1440 176" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g className="page-vine-lines">
          <path d={stem} />
          <path d="M 181 128 C 169 111 168 91 175 72" />
          <path d="M 174 91 C 154 85 149 70 157 57 C 177 61 184 76 174 91 Z" />
          <path d="M 176 106 C 194 91 207 92 215 102 C 205 119 188 120 176 106 Z" />
          <path d="M 446 147 C 437 128 440 112 454 104 C 470 95 476 109 467 118 C 458 127 448 121 453 114" />
          <path d="M 693 126 C 695 107 682 89 681 71" />
          <path d="M 681 87 C 663 78 660 64 667 52 C 685 56 692 71 681 87 Z" />
          <path d="M 688 109 C 703 93 719 94 729 103 C 721 121 702 124 688 109 Z" />
          <path d="M 944 137 C 937 120 946 103 958 86" />
          <path d="M 953 95 C 940 80 943 64 952 56 C 969 66 970 82 953 95 Z" />
          <path d="M 949 119 C 966 106 983 107 991 118 C 978 132 961 133 949 119 Z" />
          <path d="M 1194 133 C 1180 112 1185 96 1197 78" />
          <path d="M 1193 95 C 1175 85 1172 69 1181 59 C 1199 63 1205 81 1193 95 Z" />
          <path d="M 1191 111 C 1209 96 1226 100 1233 112 C 1220 126 1204 126 1191 111 Z" />
        </g>
        <path ref={trace} className="page-vine-trace" d={stem} pathLength="100" />
      </svg>
    </div>
  );
}
