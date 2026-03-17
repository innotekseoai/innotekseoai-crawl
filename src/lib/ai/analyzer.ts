/**
 * GEO Analyzer — runs page analysis using local GGUF model
 *
 * Decoupled inference from parsing:
 * 1. Run inference → always succeeds (returns raw string)
 * 2. Parse response → extract scores with flexible regex
 * 3. Apply defaults for any missing fields
 *
 * This means a parsing failure never triggers a re-inference.
 */

import { modelManager } from './model-manager.js';
import type { ProgressCallback } from './model-manager.js';
import { SYSTEM_PROMPT, buildGeoAnalysisPrompt, parseScoreResponse } from './prompts.js';
import { safeJsonParse } from './json-repair.js';
import { smartTruncate } from './truncate.js';
import { detectSchemaType } from './schema-detect.js';
import { GeoPageAnalysisSchema, type GeoPageAnalysis } from '../../types/analysis.js';
import { isSubprocessAvailable, subprocessInference, stopSession } from './subprocess-inference.js';
import { isServerHealthy, serverInference } from './server-inference.js';

const SCORE_FIELDS = [
  'entity_clarity_score', 'content_quality_score', 'semantic_structure_score',
  'entity_richness_score', 'citation_readiness_score', 'technical_seo_score',
  'user_intent_alignment_score', 'trust_signals_score', 'authority_score',
];

function clampScores(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  for (const field of SCORE_FIELDS) {
    if (typeof result[field] === 'number') {
      result[field] = Math.max(1, Math.min(10, result[field] as number));
    }
  }
  if (typeof result.fact_density_count === 'number') {
    result.fact_density_count = Math.max(0, result.fact_density_count as number);
  }
  if (typeof result.word_count === 'number') {
    result.word_count = Math.max(0, result.word_count as number);
  }
  return result;
}

export function useSubprocess(): boolean {
  return isSubprocessAvailable();
}

export { stopSession };
export { startServer, stopServer, isServerHealthy, ensureServerModel, getServerModelName } from './server-inference.js';

/**
 * Run inference once — returns raw model output, never throws on model output.
 *
 * Priority: llama-server (GPU) > subprocess (CPU) > in-process (node-llama-cpp)
 */
async function runInference(
  prompt: string,
  modelPath: string | undefined,
  onProgress?: ProgressCallback
): Promise<string> {
  // Priority 1: llama-server (persistent, GPU-accelerated)
  if (await isServerHealthy()) {
    return await serverInference(SYSTEM_PROMPT, prompt, {
      maxTokens: 300,
      onProgress,
    });
  }

  // Priority 2: subprocess (per-page CPU)
  if (isSubprocessAvailable() && modelPath) {
    return await subprocessInference(modelPath, SYSTEM_PROMPT, prompt, {
      maxTokens: 300,
      onProgress,
    });
  }

  // Priority 3: in-process node-llama-cpp
  if (!modelManager.isLoaded()) {
    throw new Error('No model loaded. Call modelManager.load() first.');
  }
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt },
  ];
  return await modelManager.inference(messages, undefined, onProgress);
}

export async function analyzePageForGeo(input: {
  url: string;
  markdown: string;
  baseUrl: string;
  modelPath?: string;
  onProgress?: ProgressCallback;
}): Promise<GeoPageAnalysis> {
  const { onProgress } = input;

  const truncatedMarkdown = smartTruncate(input.markdown, 2000);
  const detectedType = detectSchemaType({ url: input.url, markdown: input.markdown });

  const prompt = buildGeoAnalysisPrompt({ ...input, markdown: truncatedMarkdown });

  // Step 1: Run inference ONCE — store raw response
  onProgress?.('Running inference...');
  const raw = await runInference(prompt, input.modelPath, onProgress);
  onProgress?.(`Got ${raw.length} chars response`);

  // Step 2: Parse — try multiple strategies, never re-run inference
  let parsed: Record<string, unknown> | null = null;
  let parsedScoreCount = 0;

  // Strategy 1: Score format (key: value lines)
  parsed = parseScoreResponse(raw, input.url, truncatedMarkdown, detectedType);
  if (parsed) {
    onProgress?.('Parsed scores successfully');
    // Use the actual count of parsed scores from the parser (not confused by default 5s)
    parsedScoreCount = (parsed._parsedScoreCount as number) ?? 0;
    delete parsed._parsedScoreCount;
  }

  // Strategy 2: JSON parse
  if (!parsed) {
    onProgress?.('Trying JSON parse...');
    parsed = safeJsonParse(raw) as Record<string, unknown> | null;
    if (parsed) {
      parsedScoreCount = SCORE_FIELDS.filter(f => typeof parsed![f] === 'number').length;
    }
  }

  // Strategy 3: Extract any numbers from the response as fallback scores
  if (!parsed) {
    onProgress?.('Extracting any scores from response...');
    const numbers = raw.match(/\b(\d{1,2})\b/g)?.map(Number).filter(n => n >= 1 && n <= 10) ?? [];
    if (numbers.length >= 3) {
      const fields = [
        'entity_clarity_score', 'content_quality_score', 'semantic_structure_score',
        'entity_richness_score', 'citation_readiness_score', 'technical_seo_score',
        'user_intent_alignment_score', 'trust_signals_score', 'authority_score',
      ];
      parsed = {};
      for (let i = 0; i < fields.length && i < numbers.length; i++) {
        parsed[fields[i]] = numbers[i];
      }
      parsedScoreCount = Math.min(numbers.length, fields.length);
    }
  }

  // Confidence = proportion of scores actually parsed from model output (0.0-1.0)
  const confidence = Math.round((parsedScoreCount / SCORE_FIELDS.length) * 100) / 100;

  // Step 3: Build final result with defaults for any missing fields
  const path = (() => {
    try { return new URL(input.url).pathname; } catch { return input.url; }
  })();

  const defaults: Record<string, unknown> = {
    json_ld: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': detectedType,
      name: truncatedMarkdown.split('\n')[0]?.replace(/^#\s*/, '').slice(0, 80) || 'Page',
      url: input.url,
    }),
    llms_txt_entry: `- [${path}](${path}): Page content`,
    entity_clarity_score: 5,
    fact_density_count: 0,
    word_count: truncatedMarkdown.split(/\s+/).length,
    content_quality_score: 5,
    semantic_structure_score: 5,
    entity_richness_score: 5,
    citation_readiness_score: 5,
    technical_seo_score: 5,
    user_intent_alignment_score: 5,
    trust_signals_score: 5,
    authority_score: 5,
    geo_recommendations: [],
    confidence_score: confidence,
  };

  // Merge: defaults ← parsed scores (overrides defaults where present)
  const merged = { ...defaults, ...(parsed ?? {}), confidence_score: confidence };
  const clamped = clampScores(merged);

  const validated = GeoPageAnalysisSchema.safeParse(clamped);
  if (validated.success) {
    return validated.data;
  }

  // Last resort — pure defaults (should always pass)
  const fallback = GeoPageAnalysisSchema.safeParse(defaults);
  if (fallback.success) {
    onProgress?.('Using default scores');
    return fallback.data;
  }

  throw new Error(`Analysis validation failed for ${input.url}`);
}
