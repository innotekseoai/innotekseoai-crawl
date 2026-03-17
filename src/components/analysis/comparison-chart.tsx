'use client';

/**
 * Side-by-side comparison of two crawl results.
 * Green = improved, Red = declined, Gray = unchanged.
 */

interface DeltaEntry {
  before: number;
  after: number;
  delta: number;
}

interface ComparisonChartProps {
  deltas: Record<string, DeltaEntry>;
  beforeDate: string;
  afterDate: string;
}

const LABELS: Record<string, string> = {
  avg_entity_clarity: 'Entity Clarity',
  avg_content_quality: 'Content Quality',
  avg_semantic_structure: 'Semantic Structure',
  avg_entity_richness: 'Entity Richness',
  avg_citation_readiness: 'Citation Readiness',
  avg_technical_seo: 'Technical SEO',
  avg_user_intent: 'User Intent',
  avg_trust_signals: 'Trust Signals',
  avg_authority: 'Authority',
  premium_score: 'Premium Score',
  schema_completeness_score: 'Schema Completeness',
};

export function ComparisonChart({ deltas, beforeDate, afterDate }: ComparisonChartProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted mb-2">
        <span>{new Date(beforeDate).toLocaleDateString()}</span>
        <span>{new Date(afterDate).toLocaleDateString()}</span>
      </div>
      {Object.entries(deltas).map(([key, entry]) => {
        const label = LABELS[key] ?? key;
        const isScore = !key.includes('premium') && !key.includes('schema');
        const max = isScore ? 10 : 100;
        const deltaColor = entry.delta > 0 ? 'text-green-400' : entry.delta < 0 ? 'text-red-400' : 'text-muted';
        const deltaSign = entry.delta > 0 ? '+' : '';

        return (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted">{label}</span>
              <span className={deltaColor}>
                {entry.before.toFixed(1)} → {entry.after.toFixed(1)} ({deltaSign}{entry.delta.toFixed(1)})
              </span>
            </div>
            <div className="flex gap-1 h-2">
              <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-muted/40 rounded-full"
                  style={{ width: `${(entry.before / max) * 100}%` }}
                />
              </div>
              <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${entry.delta >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                  style={{ width: `${(entry.after / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
