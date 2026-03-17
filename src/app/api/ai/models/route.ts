import { NextResponse } from 'next/server';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const MODELS_DIR = resolve('./data/models');

// Default model — best balance of speed + quality on Adreno 840 GPU (Q4_0 optimized)
const DEFAULT_MODEL = 'qwen2.5-1.5b-instruct-q4_0.gguf';

// Recommended models sorted by priority (Q4_0 for GPU, larger = better quality)
const MODEL_PRIORITY: Record<string, number> = {
  'qwen2.5-1.5b-instruct-q4_0.gguf': 1,  // Best quality, 100% parse, 7s/page
  'qwen2.5-0.5b-instruct-q4_0.gguf': 2,  // Fast, 80% parse, 3.2s/page
  'qwen3-0.6b-q4_0.gguf': 10,            // Not recommended (thinking mode)
  'qwen3-1.7b-q4_0.gguf': 10,            // Not recommended (thinking mode)
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function isQ4_0(filename: string): boolean {
  return filename.includes('q4_0') || filename.includes('Q4_0');
}

export async function GET() {
  try {
    if (!existsSync(MODELS_DIR)) {
      return NextResponse.json({ models: [], defaultModel: null, serverModel: null });
    }

    const files = readdirSync(MODELS_DIR)
      .filter((f) => f.endsWith('.gguf'));

    const models = files.map((filename) => {
      const fullPath = join(MODELS_DIR, filename);
      const stats = statSync(fullPath);
      return {
        filename,
        path: fullPath,
        sizeBytes: stats.size,
        sizeHuman: formatBytes(stats.size),
        isOptimized: isQ4_0(filename),
        isDefault: filename === DEFAULT_MODEL,
      };
    });

    // Sort: default first, then Q4_0 models by priority, then others by size
    models.sort((a, b) => {
      const pa = MODEL_PRIORITY[a.filename] ?? (a.isOptimized ? 5 : 8);
      const pb = MODEL_PRIORITY[b.filename] ?? (b.isOptimized ? 5 : 8);
      if (pa !== pb) return pa - pb;
      return b.sizeBytes - a.sizeBytes;
    });

    // Check running GPU server model
    let serverModel: string | null = null;
    try {
      const res = await fetch('http://127.0.0.1:8012/v1/models', {
        signal: AbortSignal.timeout(1000),
      });
      const data = await res.json() as { data?: Array<{ id?: string }> };
      serverModel = data.data?.[0]?.id ?? null;
    } catch {}

    const defaultPath = models.find((m) => m.isDefault)?.path ?? models[0]?.path ?? null;

    return NextResponse.json({ models, defaultModel: defaultPath, serverModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list models' },
      { status: 500 }
    );
  }
}
