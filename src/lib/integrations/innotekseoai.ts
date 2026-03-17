/**
 * Push GEO analysis results to innotekseoai
 *
 * Posts GeoAnalysisResult to the configured endpoint.
 * Config via environment variables:
 *   INNOTEKSEOAI_ENDPOINT — API URL (e.g., https://api.innotekseo.com/v1/geo)
 *   INNOTEKSEOAI_API_KEY  — Bearer token for authentication
 */

import type { GeoAnalysisResult } from '@/types/analysis';

const TIMEOUT_MS = 30_000;

export function isInnotekseoaiConfigured(): boolean {
  return !!(process.env.INNOTEKSEOAI_ENDPOINT && process.env.INNOTEKSEOAI_API_KEY);
}

/**
 * Push analysis results to innotekseoai.
 * Returns true if successful, false otherwise.
 */
export async function pushToInnotekseoai(
  baseUrl: string,
  result: GeoAnalysisResult
): Promise<boolean> {
  const endpoint = process.env.INNOTEKSEOAI_ENDPOINT;
  const apiKey = process.env.INNOTEKSEOAI_API_KEY;

  if (!endpoint || !apiKey) {
    console.log('[innotekseoai] Push skipped — not configured');
    return false;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        base_url: baseUrl,
        ...result,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      console.log(`[innotekseoai] Successfully pushed results for ${baseUrl}`);
      return true;
    }

    console.error(`[innotekseoai] Push failed: HTTP ${res.status} ${res.statusText}`);
    return false;
  } catch (err) {
    console.error(`[innotekseoai] Push error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
