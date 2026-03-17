import { describe, it, expect } from 'vitest';
import { gradeFromMetrics, computeSchemaCompleteness, aggregateResults, buildLlmsTxt } from '@/lib/analysis/engine';
import type { GeoPageAnalysis } from '@/types/analysis';

function makePage(overrides: Partial<GeoPageAnalysis> = {}): GeoPageAnalysis {
  return {
    json_ld: '{"@context":"https://schema.org","@type":"WebPage","name":"Test","url":"https://example.com"}',
    llms_txt_entry: '- [Test](/): Test page',
    entity_clarity_score: 7,
    fact_density_count: 5,
    word_count: 500,
    content_quality_score: 7,
    semantic_structure_score: 7,
    entity_richness_score: 7,
    citation_readiness_score: 7,
    technical_seo_score: 7,
    user_intent_alignment_score: 7,
    trust_signals_score: 7,
    authority_score: 7,
    geo_recommendations: ['Improve schema markup'],
    ...overrides,
  };
}

describe('gradeFromMetrics', () => {
  it('returns A for excellent metrics', () => {
    expect(gradeFromMetrics(9.5, 100, 90)).toBe('A');
  });

  it('returns B for good metrics', () => {
    expect(gradeFromMetrics(7.5, 200, 75)).toBe('B');
  });

  it('returns C for average metrics', () => {
    expect(gradeFromMetrics(5.5, 350, 55)).toBe('C');
  });

  it('returns D for below average', () => {
    expect(gradeFromMetrics(3.5, 500, 35)).toBe('D');
  });

  it('returns F for poor metrics', () => {
    expect(gradeFromMetrics(1, 1000, 10)).toBe('F');
  });
});

describe('computeSchemaCompleteness', () => {
  it('gives 100% for complete schema', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Corp',
      url: 'https://example.com',
      telephone: '+1-555-0100',
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('gives 0% for invalid JSON', () => {
    expect(computeSchemaCompleteness('not json')).toBe(0);
  });

  it('gives partial score for incomplete schema', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
    });
    const score = computeSchemaCompleteness(schema);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe('buildLlmsTxt', () => {
  it('builds valid llms.txt format', () => {
    const result = buildLlmsTxt('https://example.com', [
      '- [Home](/): Homepage',
      '- [About](/about): About page',
    ]);
    expect(result).toContain('example.com');
    expect(result).toContain('- [Home](/): Homepage');
    expect(result).toContain('- [About](/about): About page');
  });
});

describe('aggregateResults', () => {
  it('aggregates single page correctly', () => {
    const result = aggregateResults('https://example.com', [
      { page_url: 'https://example.com/', result: makePage() },
    ]);
    expect(result.site_metrics.overall_grade).toBeDefined();
    expect(result.site_metrics.premium_score).toBeGreaterThan(0);
    expect(result.primary_json_ld).toBeTruthy();
    expect(result.llms_txt).toContain('example.com');
  });

  it('aggregates multiple pages with averages', () => {
    const result = aggregateResults('https://example.com', [
      { page_url: 'https://example.com/', result: makePage({ entity_clarity_score: 9 }) },
      { page_url: 'https://example.com/about', result: makePage({ entity_clarity_score: 5 }) },
    ]);
    expect(result.site_metrics.avg_entity_clarity).toBe(7); // (9+5)/2
    expect(result.pages).toHaveLength(2);
  });

  it('selects homepage JSON-LD as primary', () => {
    const homeJsonLd = '{"@type":"WebSite","name":"Home"}';
    const result = aggregateResults('https://example.com', [
      { page_url: 'https://example.com/about', result: makePage({ json_ld: '{"@type":"AboutPage"}' }) },
      { page_url: 'https://example.com/', result: makePage({ json_ld: homeJsonLd }) },
    ]);
    expect(result.primary_json_ld).toBe(homeJsonLd);
  });

  it('throws for empty results', () => {
    expect(() => aggregateResults('https://example.com', [])).toThrow('No analyzable pages');
  });

  it('uses processRecommendations for dedup/categorization', () => {
    const result = aggregateResults('https://example.com', [
      { page_url: 'https://example.com/', result: makePage({ geo_recommendations: ['[high] Add schema', 'Add schema'] }) },
      { page_url: 'https://example.com/about', result: makePage({ geo_recommendations: ['[high] Add schema'] }) },
    ]);
    // Should be deduplicated — "Add schema" appears multiple times but should be consolidated
    const allRecs = [...result.site_metrics.priority_recommendations, ...result.site_metrics.critical_issues];
    const schemaRecs = allRecs.filter(r => r.toLowerCase().includes('schema'));
    // At most a couple of unique entries, not 3 duplicates
    expect(schemaRecs.length).toBeLessThanOrEqual(2);
  });
});
