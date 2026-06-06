interface RoomCodeBannerProps {
  code: string;
  hint?: string;
}

export function RoomCodeBanner({ code, hint = 'Share this code so friends can join' }: RoomCodeBannerProps) {
  return (
    <div className="room-code-wrap">
      <h2 className="room-code-label">ROOM CODE</h2>
      <div className="room-code-value">{code || '····'}</div>
      {hint && <p className="room-code-hint">{hint}</p>}
    </div>
  );
}
