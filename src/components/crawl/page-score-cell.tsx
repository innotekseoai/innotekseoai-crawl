'use client';

/**
 * Color-coded score cell for per-page GEO scores.
 * Red (1-3), Yellow (4-6), Green (7-10).
 */

export function PageScoreCell({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-muted">--</span>;
  }

  const rounded = Math.round(score * 10) / 10;
  let colorClass: string;

  if (rounded >= 7) {
    colorClass = 'text-green-400';
  } else if (rounded >= 4) {
    colorClass = 'text-yellow-400';
  } else {
    colorClass = 'text-red-400';
  }

  return (
    <span className={`font-mono text-xs ${colorClass}`}>
      {rounded.toFixed(1)}
    </span>
  );
}
