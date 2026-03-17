'use client';

import { GradeBadge } from '@/components/ui/badge';

interface GradeRow {
  label: string;
  value: number | string;
  threshold?: { good: number; ok: number };
}

function getTrafficLight(value: number, threshold?: { good: number; ok: number }): string {
  if (!threshold) return 'text-text';
  if (value >= threshold.good) return 'text-green-400';
  if (value >= threshold.ok) return 'text-yellow-400';
  return 'text-red-400';
}

interface GradeBreakdownProps {
  grade: string;
  entityClarity: number;
  wordsPerFact: number;
  schemaCompleteness: number;
  totalFacts: number;
}

export function GradeBreakdown({ grade, entityClarity, wordsPerFact, schemaCompleteness, totalFacts }: GradeBreakdownProps) {
  const rows: GradeRow[] = [
    { label: 'Entity Clarity', value: entityClarity, threshold: { good: 7, ok: 5 } },
    { label: 'Words per Fact', value: wordsPerFact, threshold: { good: 250, ok: 400 } },
    { label: 'Schema Completeness', value: `${schemaCompleteness}%`, threshold: { good: 70, ok: 50 } },
    { label: 'Total Facts', value: totalFacts },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-muted">Overall Grade:</span>
        <GradeBadge grade={grade} />
      </div>

      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => {
            const numVal = typeof row.value === 'number' ? row.value : parseFloat(String(row.value));
            // For words per fact, lower is better (invert threshold check)
            const colorClass = row.label === 'Words per Fact'
              ? (numVal <= (row.threshold?.good ?? 0) ? 'text-green-400' : numVal <= (row.threshold?.ok ?? 0) ? 'text-yellow-400' : 'text-red-400')
              : getTrafficLight(numVal, row.threshold);

            return (
              <tr key={row.label} className="border-b border-border/30">
                <td className="py-2 text-muted">{row.label}</td>
                <td className={`py-2 text-right font-mono ${row.threshold ? colorClass : 'text-text'}`}>
                  {typeof row.value === 'number' ? row.value.toFixed(1) : row.value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
