'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';

interface ApiKeyEntry {
  id: string;
  name: string;
  createdAt: string;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchKeys(); }, []);

  async function handleGenerate() {
    if (!newName.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (data.key) {
        setNewKey(data.key);
        setNewName('');
        fetchKeys();
      }
    } catch {}
    setGenerating(false);
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
    fetchKeys();
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-accent" />
          <CardTitle>API Keys</CardTitle>
        </div>
      </CardHeader>

      {loading ? (
        <div className="text-center py-6 text-muted">Loading...</div>
      ) : (
        <div className="space-y-3">
          {/* Copy-once dialog for newly generated key */}
          {newKey && (
            <div className="p-3 rounded-lg border border-accent/50 bg-accent/5 space-y-2">
              <p className="text-xs text-accent font-medium">New API key (copy now — shown only once):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-text bg-surface2 rounded px-2 py-1 overflow-x-auto">{newKey}</code>
                <Button variant="ghost" size="sm" onClick={copyKey}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewKey(null)} className="text-xs text-muted">
                Dismiss
              </Button>
            </div>
          )}

          {keys.map((key) => (
            <div key={key.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text">{key.name}</p>
                <p className="text-xs text-muted">{new Date(key.createdAt).toLocaleDateString()}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} className="text-red-400">
                <Trash2 className="w-3 h-3" />
                Revoke
              </Button>
            </div>
          ))}

          {keys.length === 0 && !newKey && (
            <p className="text-xs text-muted">No API keys. External API access is open until you create one.</p>
          )}

          <div className="pt-3 border-t border-border flex gap-2">
            <input
              type="text"
              placeholder="Key name (e.g. CI pipeline)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text
                placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
            />
            <Button size="sm" onClick={handleGenerate} disabled={generating || !newName.trim()}>
              <Plus className="w-3 h-3" />
              Generate
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
