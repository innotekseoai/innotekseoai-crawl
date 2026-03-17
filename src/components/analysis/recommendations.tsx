'use client';

import { AlertTriangle, Lightbulb } from 'lucide-react';

interface RecommendationsProps {
  priority: string[];
  critical: string[];
}

export function Recommendations({ priority, critical }: RecommendationsProps) {
  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-400 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Critical Issues
          </h4>
          <ul className="space-y-2">
            {critical.map((item, i) => (
              <li key={i} className="text-sm text-muted bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {priority.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-accent2 flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4" />
            Priority Recommendations
          </h4>
          <ul className="space-y-2">
            {priority.map((item, i) => (
              <li key={i} className="text-sm text-muted bg-accent2/5 border border-accent2/20 rounded-lg px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
