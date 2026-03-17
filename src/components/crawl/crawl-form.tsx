'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Globe, Loader2, Cpu } from 'lucide-react';

interface Model {
  filename: string;
  path: string;
  sizeHuman: string;
  isOptimized?: boolean;
  isDefault?: boolean;
}

export function CrawlForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [limit, setLimit] = useState(50);
  const [maxDepth, setMaxDepth] = useState<number | undefined>(undefined);
  const [crawlerType, setCrawlerType] = useState<'native' | 'browser'>('native');
  const [analyze, setAnalyze] = useState(true);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [serverModel, setServerModel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        const list: Model[] = data.models ?? [];
        setModels(list);
        setServerModel(data.serverModel ?? null);
        // Use API-provided default, or first model
        const defaultPath = data.defaultModel ?? list[0]?.path;
        if (defaultPath) setSelectedModel(defaultPath);
        if (list.length === 0) setAnalyze(false);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError('Invalid URL');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { url: finalUrl, limit, crawlerType };
      if (maxDepth !== undefined) payload.maxDepth = maxDepth;
      if (analyze && selectedModel) {
        payload.analyze = true;
        payload.modelPath = selectedModel;
      }

      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start crawl');
        return;
      }

      router.push(`/crawl/${data.id}?autostart=1`);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="url" className="block text-sm font-medium text-muted">
            Website URL
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-border bg-surface2/60 text-xs text-muted select-none">
              https://
            </span>
            <input
              id="url"
              type="text"
              placeholder="example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value.replace(/^https?:\/\//i, ''))}
              className={`flex-1 bg-surface2 border border-border rounded-r-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30
                transition-colors ${error ? 'border-red-500/50' : ''}`}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted">
            Page Limit: {limit}
          </label>
          <input
            type="range"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>1</span>
            <span>200</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted">
            Max Depth: {maxDepth === undefined ? 'Unlimited' : maxDepth}
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={maxDepth ?? 10}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxDepth(v >= 10 ? undefined : v);
            }}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>0 (seed only)</span>
            <span>Unlimited</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-muted">Crawler Type</label>
          <div className="flex gap-2">
            {(['native', 'browser'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCrawlerType(type)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  crawlerType === type
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface2 text-muted hover:text-text'
                }`}
              >
                {type === 'native' ? 'Native (HTTP)' : 'Browser (Playwright)'}
              </button>
            ))}
          </div>
        </div>

        {/* AI Analysis toggle */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => models.length > 0 && setAnalyze(!analyze)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                analyze ? 'bg-accent' : 'bg-border'
              } ${models.length === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  analyze ? 'translate-x-4' : ''
                }`}
              />
            </button>
            <label className="text-sm font-medium text-muted flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Run GEO Analysis
            </label>
          </div>

          {analyze && models.length > 0 && (
            <div className="space-y-1.5">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                  focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
              >
                {models.map((m) => (
                  <option key={m.path} value={m.path}>
                    {m.filename} ({m.sizeHuman}){m.isOptimized ? ' ⚡ GPU' : ''}{m.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {serverModel && (
                <p className="text-xs text-accent/70">
                  GPU server active: {serverModel}
                  {selectedModel && !selectedModel.includes(serverModel) && (
                    <span className="text-yellow-400/70"> — will switch model on start</span>
                  )}
                </p>
              )}
            </div>
          )}

          {models.length === 0 && (
            <p className="text-xs text-muted/60">
              No models found. Place .gguf files in data/models/ to enable analysis.
            </p>
          )}
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Globe className="w-4 h-4" />
              {analyze ? 'Crawl & Analyze' : 'Start Crawl'}
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}
