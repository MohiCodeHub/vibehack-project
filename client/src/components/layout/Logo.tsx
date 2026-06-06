import { motion as Motion } from 'motion/react';

interface LogoProps {
  muted?: boolean;
  animate?: boolean;
}

export function Logo({ muted = false, animate = true }: LogoProps) {
  const content = (
    <div className="logo-wrap">
      <h1 className={muted ? 'logo-title logo-title--muted' : 'logo-title'}>WHERE TO?</h1>
      {!muted && <p className="logo-tagline">The game that actually picks a place.</p>}
    </div>
  );

  if (!animate) return content;

  return (
    <Motion.div
      initial={{ scale: 0.8, rotate: -5 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1.2] }}
    >
      {content}
    </Motion.div>
  );
}
