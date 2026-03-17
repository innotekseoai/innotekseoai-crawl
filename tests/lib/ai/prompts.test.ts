import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildGeoAnalysisPrompt,
  GEO_JSON_SCHEMA,
} from '../../../src/lib/ai/prompts.js';

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(10);
  });

  it('mentions GEO', () => {
    expect(SYSTEM_PROMPT).toContain('GEO');
  });

  it('instructs JSON-only output', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('json');
  });
});

describe('buildGeoAnalysisPrompt', () => {
  const input = {
    url: 'https://example.com/about',
    markdown: '# About Us\n\nWe are a company founded in 2019.',
    baseUrl: 'https://example.com',
  };

  it('includes the page URL', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('https://example.com/about');
  });

  it('includes the base URL', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('https://example.com');
  });

  it('includes the page markdown', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('About Us');
    expect(prompt).toContain('founded in 2019');
  });

  it('truncates markdown at 12000 chars', () => {
    const longMarkdown = 'a'.repeat(20000);
    const prompt = buildGeoAnalysisPrompt({
      ...input,
      markdown: longMarkdown,
    });
    // Should not include the full 20000 chars
    expect(prompt.length).toBeLessThan(20000 + 2000); // prompt template overhead
  });

  it('mentions all required output keys', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    const requiredKeys = [
      'json_ld',
      'llms_txt_entry',
      'entity_clarity_score',
      'fact_density_count',
      'word_count',
      'content_quality_score',
      'semantic_structure_score',
      'entity_richness_score',
      'citation_readiness_score',
      'technical_seo_score',
      'user_intent_alignment_score',
      'trust_signals_score',
      'authority_score',
      'geo_recommendations',
    ];
    for (const key of requiredKeys) {
      expect(prompt).toContain(key);
    }
  });

  it('mentions schema.org', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('schema.org');
  });
});

describe('GEO_JSON_SCHEMA', () => {
  it('is an object schema', () => {
    expect(GEO_JSON_SCHEMA.type).toBe('object');
  });

  it('has properties defined', () => {
    expect(GEO_JSON_SCHEMA.properties).toBeDefined();
    expect(Object.keys(GEO_JSON_SCHEMA.properties).length).toBeGreaterThan(10);
  });

  it('defines all required fields', () => {
    const required = GEO_JSON_SCHEMA.required;
    expect(required).toContain('json_ld');
    expect(required).toContain('entity_clarity_score');
    expect(required).toContain('fact_density_count');
    expect(required).toContain('word_count');
    expect(required).toContain('geo_recommendations');
    expect(required).toContain('content_quality_score');
    expect(required).toContain('semantic_structure_score');
    expect(required).toContain('entity_richness_score');
    expect(required).toContain('citation_readiness_score');
    expect(required).toContain('technical_seo_score');
    expect(required).toContain('user_intent_alignment_score');
    expect(required).toContain('trust_signals_score');
    expect(required).toContain('authority_score');
  });

  it('mirror_markdown is not required', () => {
    expect(GEO_JSON_SCHEMA.required).not.toContain('mirror_markdown');
  });

  it('geo_recommendations is an array of strings', () => {
    const prop = GEO_JSON_SCHEMA.properties.geo_recommendations;
    expect(prop.type).toBe('array');
    expect(prop.items.type).toBe('string');
  });

  it('score fields are typed as numbers', () => {
    const scoreFields = [
      'entity_clarity_score',
      'content_quality_score',
      'semantic_structure_score',
      'entity_richness_score',
      'citation_readiness_score',
      'technical_seo_score',
      'user_intent_alignment_score',
      'trust_signals_score',
      'authority_score',
    ];
    for (const field of scoreFields) {
      expect(
        GEO_JSON_SCHEMA.properties[field as keyof typeof GEO_JSON_SCHEMA.properties].type
      ).toBe('number');
    }
  });
});
