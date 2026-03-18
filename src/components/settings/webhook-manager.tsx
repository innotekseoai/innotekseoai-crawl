'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Webhook, Plus, Trash2, Zap, Loader2 } from 'lucide-react';

interface WebhookEntry {
  id: string;
  url: string;
  secret: string | null;
  active: boolean;
  createdAt: string;
}

export function WebhookManager() {
  const [hooks, setHooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function fetchHooks() {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      const data = await res.json();
      setHooks(data.webhooks ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchHooks(); }, []);

  async function handleAdd() {
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, secret: newSecret || undefined }),
      });
      if (res.ok) {
        setNewUrl('');
        setNewSecret('');
        fetchHooks();
      }
    } catch {}
    setAdding(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' });
    fetchHooks();
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data.success ? `OK (${data.status})` : `Failed: ${data.error ?? data.statusText}`);
    } catch {
      setTestResult('Network error');
    }
    setTesting(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-accent" />
          <CardTitle>Webhooks</CardTitle>
        </div>
      </CardHeader>

      {loading ? (
        <div className="text-center py-6 text-muted">Loading...</div>
      ) : (
        <div className="space-y-3">
          {hooks.map((hook) => (
            <div key={hook.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{hook.url}</p>
                <p className="text-xs text-muted">
                  {hook.secret ? 'Signed' : 'No secret'} · {new Date(hook.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleTest(hook.id)} disabled={testing === hook.id}>
                {testing === hook.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Test
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(hook.id)} className="text-red-400">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}

          {testResult && (
            <p className="text-xs text-muted px-1">{testResult}</p>
          )}

          <div className="pt-3 border-t border-border space-y-2">
            <input
              type="url"
              placeholder="https://example.com/webhook"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
            />
            <input
              type="text"
              placeholder="Secret (optional)"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newUrl.trim()}>
              <Plus className="w-3 h-3" />
              Add Webhook
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
