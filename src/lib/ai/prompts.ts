/**
 * Prompt templates for local AI GEO analysis
 *
 * Designed for tiny models (135M-500M params).
 * Asks for simple CSV-style scores, not full JSON — we parse into structure.
 */

export const SYSTEM_PROMPT =
  'You are a GEO scoring assistant. Reply with scores only. No explanations.';

export function buildGeoAnalysisPrompt(input: {
  url: string;
  markdown: string;
  baseUrl: string;
}): string {
  return `Rate this webpage on 10 metrics (1-10 scale). Also count verifiable facts (numbers, dates, stats) and total words.

URL: ${input.url}

Reply in EXACTLY this format (one value per line):
entity_clarity: <score>
facts: <count>
words: <count>
content_quality: <score>
semantic_structure: <score>
entity_richness: <score>
citation_readiness: <score>
technical_seo: <score>
user_intent: <score>
trust_signals: <score>
authority: <score>
summary: <one line summary for llms.txt>
rec1: [high|medium|low] <specific improvement>
rec2: [high|medium|low] <specific improvement>
rec3: [high|medium|low] <specific improvement>

PAGE CONTENT:
${input.markdown}`;
}

/**
 * Parse the simple score format into a GeoPageAnalysis-compatible object.
 * Much more reliable than asking tiny models to produce JSON.
 */
export function parseScoreResponse(raw: string, url: string, markdown: string, schemaType = 'WebPage'): Record<string, unknown> | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  function extractNumber(key: string): number | null {
    for (const line of lines) {
      // Match "Key Name: 7" or "key_name: 7" — case insensitive, flexible separators
      const match = line.match(new RegExp(`${key}[:\\s]+([\\d.]+)`, 'i'));
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }

  function extractText(key: string): string | null {
    for (const line of lines) {
      const match = line.match(new RegExp(`${key}[:\\s]+(.+)`, 'i'));
      if (match) {
        const text = match[1].trim();
        // Skip if the "text" is just a number (model confused the field)
        if (/^\d+$/.test(text)) return null;
        return text;
      }
    }
    return null;
  }

  // Flexible patterns — match "Entity Clarity", "entity_clarity", "EntityClarity"
  const entity_clarity = extractNumber('entity[_ ]?clarity');
  const facts = extractNumber('facts?');
  const words = extractNumber('words?');
  const content_quality = extractNumber('content[_ ]?quality');
  const semantic_structure = extractNumber('semantic[_ ]?structure');
  const entity_richness = extractNumber('entity[_ ]?richness');
  const citation_readiness = extractNumber('citation[_ ]?readiness');
  const technical_seo = extractNumber('technical[_ ]?seo');
  const user_intent = extractNumber('user[_ ]?intent');
  const trust_signals = extractNumber('trust[_ ]?signals?');
  const authority = extractNumber('authority');
  const summary = extractText('summary');
  // Parse up to 3 recommendations with impact levels
  const recommendations: string[] = [];
  for (const key of ['rec1', 'rec2', 'rec3', 'recommendation']) {
    const rec = extractText(key);
    if (rec) recommendations.push(rec);
  }

  // Need at least a few scores to consider it valid
  const scores = [entity_clarity, content_quality, semantic_structure, entity_richness,
    citation_readiness, technical_seo, user_intent, trust_signals, authority];
  const validScores = scores.filter(s => s !== null);
  if (validScores.length < 3) return null;

  const path = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();

  return {
    _parsedScoreCount: validScores.length,
    json_ld: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: markdown.split('\n')[0]?.replace(/^#\s*/, '').slice(0, 100) || 'Page',
      url,
    }),
    llms_txt_entry: summary
      ? `- [${summary.slice(0, 60)}](${path}): ${summary}`
      : `- [Page](${path}): Content page`,
    entity_clarity_score: entity_clarity ?? 5,
    fact_density_count: facts ?? 0,
    word_count: words ?? markdown.split(/\s+/).length,
    content_quality_score: content_quality ?? 5,
    semantic_structure_score: semantic_structure ?? 5,
    entity_richness_score: entity_richness ?? 5,
    citation_readiness_score: citation_readiness ?? 5,
    technical_seo_score: technical_seo ?? 5,
    user_intent_alignment_score: user_intent ?? 5,
    trust_signals_score: trust_signals ?? 5,
    authority_score: authority ?? 5,
    geo_recommendations: recommendations,
  };
}

// Keep for backward compatibility but no longer used for grammar enforcement
export const GEO_JSON_SCHEMA = {};
