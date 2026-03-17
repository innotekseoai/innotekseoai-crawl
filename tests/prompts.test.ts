import { describe, it, expect } from 'vitest';
import { parseScoreResponse, buildGeoAnalysisPrompt } from '@/lib/ai/prompts';

describe('parseScoreResponse', () => {
  it('parses well-formed score output', () => {
    const raw = `entity_clarity: 8
facts: 12
words: 450
content_quality: 7
semantic_structure: 6
entity_richness: 7
citation_readiness: 5
technical_seo: 8
user_intent: 7
trust_signals: 6
authority: 7
summary: A great page about widgets
rec1: [high] Add more structured data`;

    const result = parseScoreResponse(raw, 'https://example.com/page', '# Page');
    expect(result).not.toBeNull();
    expect(result!.entity_clarity_score).toBe(8);
    expect(result!.content_quality_score).toBe(7);
    expect(result!.fact_density_count).toBe(12);
    expect(result!.word_count).toBe(450);
    expect(result!.geo_recommendations).toEqual(['[high] Add more structured data']);
  });

  it('parses multiple recommendations', () => {
    const raw = `entity_clarity: 7
content_quality: 6
semantic_structure: 5
entity_richness: 6
citation_readiness: 4
technical_seo: 7
user_intent: 6
trust_signals: 5
authority: 6
summary: Some page
rec1: [high] Fix meta tags
rec2: [medium] Add schema
rec3: [low] Minor fix`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page');
    expect(result!.geo_recommendations).toHaveLength(3);
  });

  it('handles case-insensitive keys', () => {
    const raw = `Entity Clarity: 8
Content Quality: 7
Semantic Structure: 6
Entity Richness: 5
Citation Readiness: 4
Technical SEO: 9
User Intent: 7
Trust Signals: 6
Authority: 8`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page');
    expect(result).not.toBeNull();
    expect(result!.entity_clarity_score).toBe(8);
    expect(result!.technical_seo_score).toBe(9);
  });

  it('returns null with fewer than 3 valid scores', () => {
    const raw = `entity_clarity: 7
Some other text
Not useful`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page');
    expect(result).toBeNull();
  });

  it('uses detected schema type in json_ld', () => {
    const raw = `entity_clarity: 7
content_quality: 6
semantic_structure: 5
entity_richness: 6
citation_readiness: 4
technical_seo: 7
user_intent: 6
trust_signals: 5
authority: 6`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page', 'Article');
    const jsonLd = JSON.parse(result!.json_ld as string);
    expect(jsonLd['@type']).toBe('Article');
  });

  it('defaults scores to 5 for missing values', () => {
    const raw = `entity_clarity: 8
content_quality: 7
semantic_structure: 6`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page');
    expect(result!.entity_richness_score).toBe(5); // default
    expect(result!.citation_readiness_score).toBe(5); // default
  });
});

describe('buildGeoAnalysisPrompt', () => {
  it('includes URL and markdown in prompt', () => {
    const result = buildGeoAnalysisPrompt({
      url: 'https://example.com/page',
      markdown: '# Test Page\n\nContent here.',
      baseUrl: 'https://example.com',
    });
    expect(result).toContain('https://example.com/page');
    expect(result).toContain('# Test Page');
    expect(result).toContain('rec1:');
    expect(result).toContain('rec2:');
    expect(result).toContain('rec3:');
  });
});
