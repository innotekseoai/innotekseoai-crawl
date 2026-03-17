'use client';

import { Check, Loader2, Circle, AlertCircle } from 'lucide-react';

type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface Step {
  label: string;
  status: StepStatus;
  detail?: string;
}

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="mt-0.5">
            {step.status === 'completed' && (
              <div className="w-5 h-5 rounded-full bg-accent3/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-accent3" />
              </div>
            )}
            {step.status === 'active' && (
              <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                <Loader2 className="w-3 h-3 text-accent animate-spin" />
              </div>
            )}
            {step.status === 'pending' && (
              <div className="w-5 h-5 rounded-full bg-surface2 flex items-center justify-center">
                <Circle className="w-3 h-3 text-muted" />
              </div>
            )}
            {step.status === 'error' && (
              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-3 h-3 text-red-400" />
              </div>
            )}
          </div>
          <div>
            <p className={`text-sm ${step.status === 'active' ? 'text-accent' : step.status === 'completed' ? 'text-text' : 'text-muted'}`}>
              {step.label}
            </p>
            {step.detail && <p className="text-xs text-muted mt-0.5">{step.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
