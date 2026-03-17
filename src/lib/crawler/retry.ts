/**
 * Generic retry with exponential backoff + jitter
 *
 * Replaces duplicated retry logic across the codebase with a single utility.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 500) */
  baseDelay?: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay?: number;
  /** Called before each retry with attempt number and error */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * Delay formula: min(maxDelay, baseDelay * 2^attempt) * jitter(0.5–1.0)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelay = 500,
    maxDelay = 10_000,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) break;

      const expDelay = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = 0.5 + Math.random() * 0.5;
      const delay = Math.round(expDelay * jitter);

      onRetry?.(attempt + 1, lastError);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
