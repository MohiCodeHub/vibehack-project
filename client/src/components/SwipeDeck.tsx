import { useRef, useState } from 'react';
import type { SwipeCard, SwipeChoice } from '@shared/types.ts';
import { Heart, X } from 'lucide-react';
import { AnimatePresence, motion as Motion } from 'motion/react';

/**
 * Swipeable binary trade-off cards. Touch-drag OR tap buttons (accessibility).
 */
export function SwipeDeck({ cards, onDone }: { cards: SwipeCard[]; onDone: (c: SwipeChoice[]) => void }) {
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<SwipeChoice[]>([]);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null);
  const startX = useRef<number | null>(null);

  const card = cards[index];

  function commit(pick: 'left' | 'right') {
    if (leaving || !card) return;
    setLeaving(pick);
    const next = [...choices, { cardId: card.id, pick, choice: pick === 'left' ? card.left : card.right }];
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

  return (
    <div className="swipe-wrap">
      <div className="swipe-progress">
        {cards.map((_, i) => (
          <span
            key={i}
            className={`swipe-progress__tick${i < index ? ' swipe-progress__tick--done' : ''}${i === index ? ' swipe-progress__tick--now' : ''}`}
          />
        ))}
      </div>

      <div className="swipe-stage">
        <AnimatePresence mode="wait">
          <Motion.div
            key={card.id}
            className="swipe-card"
            style={{ transform: `translateX(${tx}px) rotate(${rot}deg)` }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <p className="swipe-card__question">{card.axis}</p>
            <p className="phase-sub" style={{ marginBottom: 'auto' }}>
              {card.left} vs {card.right}
            </p>
            <div className="swipe-card__actions">
              <button type="button" className="swipe-btn-round swipe-btn-round--no" onClick={() => commit('left')} aria-label={card.left}>
                <X size={32} />
              </button>
              <button type="button" className="swipe-btn-round swipe-btn-round--yes" onClick={() => commit('right')} aria-label={card.right}>
                <Heart size={32} fill="currentColor" />
              </button>
            </div>
          </Motion.div>
        </AnimatePresence>
      </div>

      <p className="hint">Swipe or tap · {cards.length - index} left</p>
    </div>
  );
}
