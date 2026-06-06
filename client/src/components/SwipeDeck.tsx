import { useRef, useState } from 'react';
import type { SwipeCard, SwipeChoice } from '@shared/types.ts';

/**
 * A swipeable stack of binary trade-off cards. Touch-drag OR tap the buttons
 * (accessibility). Calls onDone with the choices once the deck is exhausted.
 */
export function SwipeDeck({ cards, onDone }: { cards: SwipeCard[]; onDone: (c: SwipeChoice[]) => void }) {
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<SwipeChoice[]>([]);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null);
  const startX = useRef<number | null>(null);

  const card = cards[index];

  function commit(pick: 'left' | 'right') {
    if (leaving) return;
    setLeaving(pick);
    const next = [...choices, { cardId: card.id, pick }];
    window.setTimeout(() => {
      setChoices(next);
      setDrag(0);
      setLeaving(null);
      if (index + 1 >= cards.length) onDone(next);
      else setIndex(index + 1);
    }, 220);
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null) return;
    setDrag(e.touches[0].clientX - startX.current);
  }
  function onTouchEnd() {
    if (Math.abs(drag) > 90) commit(drag > 0 ? 'right' : 'left');
    else setDrag(0);
    startX.current = null;
  }

  if (!card) return null;

  const rot = leaving ? (leaving === 'right' ? 18 : -18) : drag / 20;
  const tx = leaving ? (leaving === 'right' ? 500 : -500) : drag;
  const tilt = drag > 40 ? 'right' : drag < -40 ? 'left' : null;

  return (
    <div className="swipe-wrap">
      <div className="swipe-progress">
        {cards.map((_, i) => (
          <span key={i} className={`tick ${i < index ? 'done' : i === index ? 'now' : ''}`} />
        ))}
      </div>

      <div className="swipe-stage">
        <div
          className={`swipe-card ${leaving ? 'leaving' : ''}`}
          style={{ transform: `translateX(${tx}px) rotate(${rot}deg)` }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="swipe-axis">{card.axis}</div>
          <div className={`swipe-side left ${tilt === 'left' ? 'hot' : ''}`}>{card.left}</div>
          <div className="swipe-vs">vs</div>
          <div className={`swipe-side right ${tilt === 'right' ? 'hot' : ''}`}>{card.right}</div>
        </div>
      </div>

      <div className="swipe-buttons">
        <button className="btn swipe-btn left" onClick={() => commit('left')}>
          ← {card.left}
        </button>
        <button className="btn swipe-btn right" onClick={() => commit('right')}>
          {card.right} →
        </button>
      </div>
      <p className="hint">Swipe or tap · {cards.length - index} left</p>
    </div>
  );
}
