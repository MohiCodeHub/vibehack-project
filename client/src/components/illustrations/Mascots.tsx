// Hand-built inline-SVG mascots — flat colors + chunky black outlines to match
// the arcade button/card style. No image assets; fully scalable. Topic-agnostic
// so they hold up for any decision (dinner, movies, anything).

import { motion as Motion } from 'motion/react';

const BORDER = '#000000';

type BeanProps = {
  color: string;
  /** eye gaze direction */
  gaze?: 'front' | 'up';
};

/** A single blob character drawn in a ~100x132 local box. */
function Bean({ color, gaze = 'front' }: BeanProps) {
  const ey = gaze === 'up' ? 48 : 56;
  const ex = gaze === 'up' ? 2 : 0; // glance to the side when thinking
  return (
    <g>
      {/* feet */}
      <ellipse cx="38" cy="122" rx="13" ry="9" fill={BORDER} />
      <ellipse cx="62" cy="122" rx="13" ry="9" fill={BORDER} />
      {/* body */}
      <rect x="14" y="18" width="72" height="104" rx="36" fill={color} stroke={BORDER} strokeWidth="6" />
      {/* eyes */}
      <circle cx={40 + ex} cy={ey} r="6.5" fill={BORDER} />
      <circle cx={62 + ex} cy={ey} r="6.5" fill={BORDER} />
      <circle cx={42 + ex} cy={ey - 2} r="2" fill="#fff" />
      <circle cx={64 + ex} cy={ey - 2} r="2" fill="#fff" />
      {/* cheeks */}
      <circle cx="30" cy={ey + 12} r="4.5" fill="#fff" opacity="0.35" />
      <circle cx="72" cy={ey + 12} r="4.5" fill="#fff" opacity="0.35" />
      {/* smile */}
      <path
        d={`M38 ${ey + 16} Q50 ${ey + 27} 62 ${ey + 16}`}
        fill="none"
        stroke={BORDER}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );
}

function Sparkle({ x, y, s = 1, color = '#fff' }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <path
      d="M0 -10 Q1.5 -1.5 10 0 Q1.5 1.5 0 10 Q-1.5 1.5 -10 0 Q-1.5 -1.5 0 -10 Z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={color}
      stroke={BORDER}
      strokeWidth="2.5"
    />
  );
}

const floatT = (delay: number) => ({ duration: 3, repeat: Infinity, ease: 'easeInOut' as const, delay });

/** "The crew" — a friendly group, for the home / create screen. */
export function CrewMascot() {
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="A group of friends ready to decide where to go">
      {/* left friend */}
      <Motion.g animate={{ y: [0, -7, 0] }} transition={floatT(0.4)} style={{ transformOrigin: 'center' }}>
        <g transform="translate(8 42) scale(0.82)">
          <Bean color="#4ade80" />
        </g>
      </Motion.g>

      {/* right friend */}
      <Motion.g animate={{ y: [0, -7, 0] }} transition={floatT(0.9)}>
        <g transform="translate(205 46) scale(0.82)">
          <Bean color="#f87171" />
        </g>
      </Motion.g>

      {/* center friend (tallest), arm raised */}
      <Motion.g animate={{ y: [0, -10, 0] }} transition={floatT(0)}>
        <g transform="translate(108 10) scale(1.04)">
          {/* raised arm */}
          <rect x="78" y="34" width="16" height="46" rx="8" fill="#fbbf24" stroke={BORDER} strokeWidth="6" transform="rotate(28 86 57)" />
          <Bean color="#fbbf24" />
        </g>
      </Motion.g>

      {/* sparkles */}
      <Motion.g animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }} transition={floatT(0.2)}>
        <Sparkle x={40} y={36} s={1.1} color="#fbbf24" />
      </Motion.g>
      <Motion.g animate={{ scale: [1, 1.25, 1] }} transition={floatT(1.1)}>
        <Sparkle x={286} y={44} s={0.9} color="#60a5fa" />
      </Motion.g>
      <Motion.g animate={{ scale: [1, 1.2, 1] }} transition={floatT(0.7)}>
        <Sparkle x={168} y={20} s={0.8} color="#f87171" />
      </Motion.g>
    </svg>
  );
}

/** "The decider" — one mascot mulling it over with a ? bubble. Topic-agnostic. */
export function DecidingMascot() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-label="A character deciding what to pick">
      <Motion.g animate={{ y: [0, -8, 0] }} transition={floatT(0)}>
        <g transform="translate(58 56)">
          {/* hand-on-chin arm */}
          <rect x="60" y="62" width="15" height="40" rx="7.5" fill="#a78bfa" stroke={BORDER} strokeWidth="6" transform="rotate(-32 67 82)" />
          <circle cx="74" cy="60" r="11" fill="#a78bfa" stroke={BORDER} strokeWidth="6" />
          <Bean color="#a78bfa" gaze="up" />
        </g>
      </Motion.g>

      {/* thought bubble */}
      <Motion.g animate={{ y: [0, -6, 0], rotate: [-3, 3, -3] }} transition={floatT(0.3)} style={{ transformOrigin: '170px 50px' }}>
        <circle cx="138" cy="92" r="6" fill="#fff" stroke={BORDER} strokeWidth="4" />
        <circle cx="150" cy="78" r="9" fill="#fff" stroke={BORDER} strokeWidth="4" />
        <rect x="150" y="20" width="78" height="58" rx="26" fill="#fff" stroke={BORDER} strokeWidth="5" />
        <text
          x="189"
          y="62"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontSize="46"
          fontWeight="900"
          fill={BORDER}
        >
          ?
        </text>
      </Motion.g>
    </svg>
  );
}
