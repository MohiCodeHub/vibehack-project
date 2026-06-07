interface DecisionTopicDisplayProps {
  topic: string;
}

/** Prominent lobby banner for the group's shared decision objective. */
export function DecisionTopicDisplay({ topic }: DecisionTopicDisplayProps) {
  return (
    <p className="decision-topic" role="status">
      <span className="decision-topic__icon" aria-hidden>
        🎯
      </span>
      <span className="decision-topic__label">Deciding:</span>{' '}
      <span className="decision-topic__text">{topic}</span>
    </p>
  );
}
