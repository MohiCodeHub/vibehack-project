import type { Restaurant } from '@shared/types.ts';

function priceStr(level?: number) {
  return level ? '$'.repeat(level) : '';
}

export function RestaurantCard({ r, championed }: { r: Restaurant; championed?: boolean }) {
  return (
    <div className={`resto-card ${championed ? 'championed' : ''}`}>
      <div className="resto-top">
        <h3 className="resto-name">{r.name}</h3>
        {championed && <span className="champ-badge">your pick</span>}
      </div>
      <div className="resto-meta">
        {r.category && <span className="chip">{r.category}</span>}
        {r.priceLevel ? <span className="chip">{priceStr(r.priceLevel)}</span> : null}
        {r.rating ? <span className="chip">★ {r.rating.toFixed(1)}</span> : null}
        {r.source === 'freetext' && <span className="chip subtle">custom</span>}
      </div>
      {r.address && <p className="resto-addr">{r.address}</p>}
      {r.mapUrl && (
        <a className="map-link" href={r.mapUrl} target="_blank" rel="noreferrer">
          View on map ↗
        </a>
      )}
    </div>
  );
}
