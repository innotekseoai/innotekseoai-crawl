'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cpu, HardDrive, RefreshCw } from 'lucide-react';

interface Model {
  filename: string;
  path: string;
  sizeBytes: number;
  sizeHuman: string;
}

export default function SettingsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/models');
      const data = await res.json();
      setModels(data.models ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchModels();
  }, []);

  return (
    <>
      <Header
        title="Settings"
        description="Configure models and crawler defaults"
      />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-accent" />
                <CardTitle>GGUF Models</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchModels}>
                <RefreshCw className="w-3 h-3" />
                Refresh
              </Button>
            </div>
          </CardHeader>

          {loading ? (
            <div className="text-center py-8 text-muted">Scanning data/models/...</div>
          ) : models.length === 0 ? (
            <div className="text-center py-8">
              <HardDrive className="w-8 h-8 text-muted mx-auto mb-3" />
              <p className="text-muted text-sm">No GGUF models found</p>
              <p className="text-muted text-xs mt-1">
                Place .gguf files in <code className="text-accent">data/models/</code>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((model) => (
                <label
                  key={model.filename}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModel === model.path
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-border hover:bg-surface2/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.path}
                    checked={selectedModel === model.path}
                    onChange={() => setSelectedModel(model.path)}
                    className="accent-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">{model.filename}</p>
                    <p className="text-xs text-muted">{model.sizeHuman}</p>
                  </div>
                  <Badge variant="default">GGUF</Badge>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crawler Defaults</CardTitle>
          </CardHeader>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Default page limit</span>
              <span className="text-text font-mono">50</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Default crawler type</span>
              <Badge variant="info">native</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Concurrency</span>
              <span className="text-text font-mono">5</span>
            </div>
            <p className="text-xs text-muted pt-2 border-t border-border">
              Crawler defaults are configured in the source code. Override per-crawl via the New Crawl form.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
