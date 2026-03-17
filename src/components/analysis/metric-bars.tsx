'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Metric {
  label: string;
  value: number;
  max?: number;
  description?: string;
}

function getBarColor(value: number, max: number): string {
  const pct = value / max;
  if (pct >= 0.8) return '#00ff9d';
  if (pct >= 0.6) return '#7bff5c';
  if (pct >= 0.4) return '#ffd600';
  if (pct >= 0.2) return '#ff8c00';
  return '#ff3d3d';
}

const metricDescriptions: Record<string, string> = {
  'Content Quality': 'Depth, accuracy, and uniqueness of content for AI citation',
  'Semantic Structure': 'How well content is organized with headings, lists, and logical flow',
  'Entity Richness': 'Density and clarity of named entities (people, places, concepts)',
  'Citation Readiness': 'How easily AI systems can extract and cite specific facts',
  'Technical SEO': 'Schema markup, meta tags, and technical optimization',
  'User Intent': 'Alignment between content and likely search/AI query intent',
  'Trust Signals': 'Author credentials, sources, dates, and authority indicators',
  'Authority': 'Domain expertise signals and authoritative content markers',
};

export function MetricBars({ metrics }: { metrics: Metric[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {metrics.map((metric) => {
        const max = metric.max ?? 10;
        const pct = (metric.value / max) * 100;
        const color = getBarColor(metric.value, max);
        const isExpanded = expanded === metric.label;
        const desc = metric.description ?? metricDescriptions[metric.label];

        return (
          <div key={metric.label}>
            <button
              type="button"
              onClick={() => setExpanded(isExpanded ? null : metric.label)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-sm text-muted">
                  {desc ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-3" />}
                  {metric.label}
                </div>
                <span className="text-sm font-mono" style={{ color }}>
                  {metric.value.toFixed(1)}/{max}
                </span>
              </div>
              <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </button>
            {isExpanded && desc && (
              <p className="text-xs text-muted mt-1 ml-5">{desc}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
