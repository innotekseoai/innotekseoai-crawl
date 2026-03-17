/**
 * Subprocess-based inference using llama-completion binary
 *
 * Spawns llama-completion per page — simple, reliable, no interactive mode.
 * Model reload costs ~2s for 135M model (OS page cache keeps it warm).
 * Generation at ~35-100+ tok/s with full ARM NEON/SVE optimizations.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type ProgressCallback = (message: string) => void;

const LLAMA_BIN = resolve(
  process.env.LLAMA_BIN_PATH ??
  '/data/data/com.termux/files/home/repos/innotekseo/llama-cpp-opencl/build/bin/llama-completion'
);

export function isSubprocessAvailable(): boolean {
  return existsSync(LLAMA_BIN);
}

export async function subprocessInference(
  modelPath: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxTokens?: number;
    onProgress?: ProgressCallback;
  } = {}
): Promise<string> {
  const { maxTokens = 300, onProgress } = options;

  if (!existsSync(LLAMA_BIN)) {
    throw new Error(`llama-completion not found at ${LLAMA_BIN}`);
  }

  onProgress?.('Launching inference...');

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const proc = execFile(LLAMA_BIN, [
      '-m', modelPath,
      '-sys', systemPrompt,
      '-p', userPrompt,
      '-n', String(maxTokens),
      '--no-display-prompt',
      '--temp', '0.1',
    ], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${process.env.HOME}:${process.env.LD_LIBRARY_PATH ?? ''}`,
      },
    }, (error, stdout, stderr) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Parse speed from stderr
      const speedMatch = stderr?.match(/eval time.*?(\d+\.\d+)\s*tokens per second/);
      const speed = speedMatch ? `${speedMatch[1]} tok/s` : '';

      if (error && !stdout?.trim()) {
        reject(new Error(`Inference failed (${elapsed}s): ${error.message}`));
        return;
      }

      const result = stdout.trim().replace(/\s*\[end of text\]\s*$/, '');
      onProgress?.(`Done — ${elapsed}s ${speed}`);
      resolve(result);
    });

    // Close stdin immediately so the process exits after generating (no interactive wait)
    proc.stdin?.end();

    // Progress from stderr
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('Loading model') || text.includes('load the model')) {
        onProgress?.('Loading model...');
      }
    });
  });
}

// No-op session management (kept for API compatibility)
export function stopSession(): void {}
export async function getSession(): Promise<never> {
  throw new Error('Use subprocessInference directly');
}
