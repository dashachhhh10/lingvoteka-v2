import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

const stem =
  'M -20 122 C 120 120 250 116 340 120 C 470 130 570 143 700 133 C 820 120 930 104 1020 109 C 1130 114 1260 127 1460 116';

export function PageVine() {
  const vine = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!vine.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      const sways = [
        { selector: '.page-vine-sprig-one', origin: '340 120', angle: 8, duration: 2.8 },
        { selector: '.page-vine-sprig-two', origin: '700 133', angle: 7, duration: 3.4 },
        { selector: '.page-vine-sprig-three', origin: '1020 109', angle: 9, duration: 3.1 },
        { selector: '.page-vine-sprig-four', origin: '1245 120', angle: 6, duration: 3.7 },
      ];

      sways.forEach(({ selector, origin, angle, duration }) => {
        gsap.fromTo(
          selector,
          { rotation: -angle, svgOrigin: origin },
          {
            rotation: angle,
            svgOrigin: origin,
            duration,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          },
        );
      });
    }, vine);
    return () => context.revert();
  }, []);

  return (
    <div className="page-vine" aria-hidden="true" ref={vine}>
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
          <path d="M 742 89 C 746 93 749 97 750 101" />
          <path
            className="page-vine-lemon"
            d="M 751 101 C 759 99 765 106 764 114 C 763 122 758 127 751 126 C 743 126 739 120 740 113 C 741 107 746 102 751 101 Z"
          />
        </g>
        <g className="page-vine-foliage page-vine-sprig page-vine-sprig-three">
          <path d="M 1020 109 C 1011 94 1012 78 1024 63" />
          <path d="M 1015 87 C 999 81 996 69 1004 59 C 1018 65 1024 77 1015 87 Z" />
          <path d="M 1018 79 C 1033 68 1047 71 1052 81 C 1041 91 1027 91 1018 79 Z" />
        </g>
        <g className="page-vine-foliage page-vine-sprig page-vine-sprig-four">
          <path d="M 1245 120 C 1238 108 1243 97 1255 91" />
          <path d="M 1254 92 C 1242 82 1243 72 1250 65 C 1262 73 1264 84 1254 92 Z" />
          <path d="M 1255 91 C 1259 94 1261 98 1262 102" />
          <path
            className="page-vine-lemon"
            d="M 1263 102 C 1270 101 1275 106 1275 113 C 1275 120 1270 125 1263 125 C 1256 125 1252 119 1253 113 C 1253 107 1257 103 1263 102 Z"
          />
        </g>
        <path
          className="page-vine-curl"
          d="M 535 135 C 521 119 522 106 532 100 C 542 94 550 104 544 112 C 540 117 532 114 534 109"
        />
      </svg>
    </div>
  );
}
