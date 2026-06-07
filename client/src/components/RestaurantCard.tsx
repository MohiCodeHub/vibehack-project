import type { Restaurant } from '@shared/types.ts';
import { Sparkles } from 'lucide-react';
import { Badge } from './ui/Badge.tsx';
import { cn } from './ui/utils.ts';

function priceStr(level?: number) {
  return level ? '$'.repeat(level) : '';
}

export function RestaurantCard({
  r,
  championed,
  highlight,
  compact,
}: {
  r: Restaurant;
  championed?: boolean;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'resto-card',
        highlight ? 'resto-card--highlight' : 'resto-card--default',
        championed && 'resto-card--championed',
      )}
    >
      <div className="resto-card__top">
        <h3 className="resto-card__name">{r.name}</h3>
        {championed && <Badge variant="warning">your pick</Badge>}
        {highlight && !compact && <Sparkles size={24} />}
      </div>
      <div className="resto-card__meta">
        {r.category && <span className="resto-card__chip">{r.category}</span>}
        {r.priceLevel ? <span className="resto-card__chip">{priceStr(r.priceLevel)}</span> : null}
        {r.rating ? <span className="resto-card__chip">★ {r.rating.toFixed(1)}</span> : null}
        {r.source === 'freetext' && <span className="resto-card__chip">custom</span>}
      </div>
      {!compact && r.address && <p className="resto-card__addr">{r.address}</p>}
    </div>
  );
}
