import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildGeoAnalysisPrompt,
  parseScoreResponse,
} from '../../../src/lib/ai/prompts.js';

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(10);
  });

  it('mentions GEO', () => {
    expect(SYSTEM_PROMPT).toContain('GEO');
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

  it('includes the page markdown', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('About Us');
    expect(prompt).toContain('founded in 2019');
  });

  it('requests score fields', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('entity_clarity');
    expect(prompt).toContain('content_quality');
    expect(prompt).toContain('trust_signals');
    expect(prompt).toContain('authority');
  });

  it('requests multiple recommendations', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('rec1:');
    expect(prompt).toContain('rec2:');
    expect(prompt).toContain('rec3:');
  });

  it('includes page content', () => {
    const prompt = buildGeoAnalysisPrompt(input);
    expect(prompt).toContain('PAGE CONTENT:');
  });
});

describe('parseScoreResponse', () => {
  it('parses valid score output', () => {
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
summary: About page
rec1: [high] Add more data`;

    const result = parseScoreResponse(raw, 'https://example.com/', '# Page');
    expect(result).not.toBeNull();
    expect(result!.entity_clarity_score).toBe(8);
    expect(result!.technical_seo_score).toBe(8);
    expect(result!.fact_density_count).toBe(12);
  });

  it('returns null with too few scores', () => {
    const result = parseScoreResponse('random text', 'https://example.com/', '# Page');
    expect(result).toBeNull();
  });

  it('generates json_ld with schema type', () => {
    const raw = `entity_clarity: 7\ncontent_quality: 6\nsemantic_structure: 5\nentity_richness: 6\ncitation_readiness: 4\ntechnical_seo: 7\nuser_intent: 6\ntrust_signals: 5\nauthority: 6`;
    const result = parseScoreResponse(raw, 'https://example.com/', '# Page', 'Article');
    const jsonLd = JSON.parse(result!.json_ld as string);
    expect(jsonLd['@type']).toBe('Article');
    expect(jsonLd['@context']).toBe('https://schema.org');
  });
});
