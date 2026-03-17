/**
 * Server-based inference using llama-server HTTP API
 *
 * Connects to a persistent llama-server process with GPU (OpenCL) acceleration.
 * Eliminates per-page model reload cost and enables Adreno 840 GPU offload.
 *
 * Start the server:
 *   LD_LIBRARY_PATH=/system/lib64:/vendor/lib64 llama-server \
 *     -m data/models/qwen2.5-0.5b-instruct-q4_0.gguf -ngl 99 \
 *     --host 127.0.0.1 --port 8012
 *
 * First startup takes ~5-10 min for OpenCL kernel compilation (one-time cost).
 */

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export type ProgressCallback = (message: string) => void;

const SERVER_URL = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8012';
const LLAMA_SERVER_BIN = resolve(
  process.env.LLAMA_SERVER_BIN_PATH ??
  '/data/data/com.termux/files/home/repos/innotekseo/llama-cpp-opencl/build/bin/llama-server'
);

let serverProcess: ChildProcess | null = null;

/**
 * Check if llama-server binary exists on disk.
 */
export function isServerBinaryAvailable(): boolean {
  return existsSync(LLAMA_SERVER_BIN);
}

/**
 * Check if the llama-server is running and healthy.
 */
export async function isServerHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json() as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Get the model name currently loaded in the running server.
 * Returns null if server is not running or model can't be determined.
 */
export async function getServerModelName(): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json() as { data?: Array<{ id?: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensure the server is running with the requested model.
 * If the server is running a different model, it will be restarted.
 * If the server is already running the correct model, this is a no-op.
 */
export async function ensureServerModel(
  modelPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const requestedModel = basename(modelPath);

  if (await isServerHealthy()) {
    const currentModel = await getServerModelName();
    if (currentModel === requestedModel) {
      onProgress?.(`GPU server ready — ${currentModel}`);
      return;
    }

    // Different model — need to restart
    onProgress?.(`Switching model: ${currentModel} → ${requestedModel}`);
    stopServer();
    // Wait for port to be released
    await new Promise(r => setTimeout(r, 2000));
  }

  // Start with requested model
  await startServer(modelPath, onProgress);
}

/**
 * Start llama-server as a managed child process with GPU acceleration.
 * Returns once the server is healthy and ready to accept requests.
 */
export async function startServer(
  modelPath: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  // Already running with some model?
  if (await isServerHealthy()) {
    onProgress?.('llama-server already running');
    return;
  }

  if (!existsSync(LLAMA_SERVER_BIN)) {
    throw new Error(`llama-server not found at ${LLAMA_SERVER_BIN}`);
  }

  if (!existsSync(modelPath)) {
    throw new Error(`Model not found at ${modelPath}`);
  }

  const modelName = basename(modelPath);
  onProgress?.(`Starting GPU server with ${modelName}...`);

  const [host, port] = (() => {
    try {
      const u = new URL(SERVER_URL);
      return [u.hostname, u.port || '8012'];
    } catch {
      return ['127.0.0.1', '8012'];
    }
  })();

  serverProcess = spawn(LLAMA_SERVER_BIN, [
    '-m', modelPath,
    '-ngl', '99',
    '--host', host,
    '--port', port,
    '-n', '300',
    '--temp', '0.1',
    '--ctx-size', '2048',
    '--threads', '4',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `/system/lib64:/vendor/lib64:${process.env.LD_LIBRARY_PATH ?? ''}`,
    },
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[llama-server] spawn error:', err.message);
    serverProcess = null;
  });

  serverProcess.on('exit', (code) => {
    console.error(`[llama-server] exited with code ${code}`);
    serverProcess = null;
  });

  // Log stderr for kernel compilation progress
  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes('loading OpenCL kernels')) {
      onProgress?.('Compiling GPU kernels (cached after first run)...');
    }
    if (text.includes('default device:')) {
      onProgress?.('GPU kernels loaded, initializing model...');
    }
    if (text.includes('listening on') || text.includes('HTTP server listening')) {
      onProgress?.(`GPU server ready — ${modelName}`);
    }
  });

  // Wait for server to become healthy
  const maxWait = 15 * 60 * 1000; // 15 min max for kernel compilation
  const pollInterval = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    if (!serverProcess || serverProcess.exitCode !== null) {
      throw new Error('llama-server exited during startup');
    }

    if (await isServerHealthy()) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      onProgress?.(`GPU server ready — ${modelName} (${elapsed}s startup)`);
      return;
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Timed out
  stopServer();
  throw new Error('llama-server failed to start within 15 minutes');
}

/**
 * Stop any running llama-server process (managed or external).
 */
export function stopServer(): void {
  // Kill managed child process
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess && serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }
  serverProcess = null;

  // Also kill any externally-started llama-server on our port
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    execFileSync('pkill', ['-f', 'llama-server'], { stdio: 'ignore' });
  } catch {
    // pkill may fail if no process found — that's fine
  }
}

/**
 * Run inference via the llama-server HTTP API.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 */
export async function serverInference(
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxTokens?: number;
    onProgress?: ProgressCallback;
  } = {}
): Promise<string> {
  const { maxTokens = 300, onProgress } = options;

  // Verify server is running
  if (!await isServerHealthy()) {
    throw new Error('llama-server is not running. Call startServer() first.');
  }

  onProgress?.('Sending to GPU...');
  const startTime = Date.now();

  const res = await fetch(`${SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`llama-server error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { completion_tokens?: number; prompt_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? '';
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const tokens = data.usage?.completion_tokens ?? 0;
  const speed = tokens > 0 ? `${(tokens / parseFloat(elapsed)).toFixed(0)} tok/s` : '';

  onProgress?.(`Done — ${elapsed}s ${speed}`);

  return content.trim().replace(/\s*\[end of text\]\s*$/, '');
}
