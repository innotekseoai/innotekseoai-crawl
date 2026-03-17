import { describe, it, expect } from 'vitest';
import {
  round,
  gradeFromMetrics,
  computeSchemaCompleteness,
  buildLlmsTxt,
  aggregateResults,
} from '../../../src/lib/analysis/engine.js';
import type { GeoPageAnalysis } from '../../../src/types/analysis.js';

// ---------------------------------------------------------------------------
// round
// ---------------------------------------------------------------------------
describe('round', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(round(3.14159)).toBe(3.14);
  });

  it('rounds to specified decimal places', () => {
    expect(round(3.14159, 3)).toBe(3.142);
  });

  it('rounds to 0 decimal places', () => {
    expect(round(3.6, 0)).toBe(4);
  });

  it('handles negative numbers', () => {
    expect(round(-2.555, 2)).toBe(-2.56); // IEEE 754 rounds -2.555 to -2.56
  });

  it('handles integers', () => {
    expect(round(5, 2)).toBe(5);
  });

  it('handles zero', () => {
    expect(round(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// gradeFromMetrics
// ---------------------------------------------------------------------------
describe('gradeFromMetrics', () => {
  it('returns A for excellent metrics', () => {
    expect(gradeFromMetrics(9.5, 100, 90)).toBe('A');
  });

  it('returns A at exact thresholds', () => {
    expect(gradeFromMetrics(9, 150, 85)).toBe('A');
  });

  it('returns B for good metrics', () => {
    expect(gradeFromMetrics(7, 200, 70)).toBe('B');
  });

  it('returns B when entity clarity is 8 (within B range)', () => {
    expect(gradeFromMetrics(8, 200, 75)).toBe('B');
  });

  it('returns C for moderate metrics', () => {
    expect(gradeFromMetrics(5, 300, 50)).toBe('C');
  });

  it('returns D for weak metrics', () => {
    expect(gradeFromMetrics(3, 500, 30)).toBe('D');
  });

  it('returns F for poor metrics', () => {
    expect(gradeFromMetrics(2, 700, 10)).toBe('F');
  });

  it('returns F when entity clarity is too low despite good facts', () => {
    expect(gradeFromMetrics(2, 100, 90)).toBe('F');
  });

  it('returns F when facts are too sparse despite good clarity', () => {
    expect(gradeFromMetrics(9, 700, 90)).toBe('F');
  });

  it('returns F when schema is too low despite good clarity and facts', () => {
    expect(gradeFromMetrics(9, 100, 20)).toBe('F');
  });

  it('handles boundary: clarity 9 but bad fact density → not A', () => {
    expect(gradeFromMetrics(9, 300, 90)).not.toBe('A');
  });

  it('handles boundary: clarity 7 with A facts but low schema → not B', () => {
    expect(gradeFromMetrics(7, 100, 50)).not.toBe('B');
  });

  // Fact density grade boundaries
  it('fact density 150 words/fact → A grade for facts', () => {
    expect(gradeFromMetrics(9, 150, 85)).toBe('A');
  });

  it('fact density 151 words/fact → B grade for facts', () => {
    expect(gradeFromMetrics(9, 151, 85)).not.toBe('A');
  });

  it('fact density 250 words/fact → B grade for facts', () => {
    expect(gradeFromMetrics(7, 250, 70)).toBe('B');
  });

  it('fact density 251 → C grade for facts', () => {
    expect(gradeFromMetrics(7, 251, 70)).not.toBe('B');
  });

  it('fact density 400 → C grade for facts', () => {
    expect(gradeFromMetrics(5, 400, 50)).toBe('C');
  });

  it('fact density 600 → D grade for facts', () => {
    expect(gradeFromMetrics(3, 600, 30)).toBe('D');
  });

  it('fact density 601 → F grade for facts', () => {
    expect(gradeFromMetrics(3, 601, 30)).toBe('F');
  });
});

// ---------------------------------------------------------------------------
// computeSchemaCompleteness
// ---------------------------------------------------------------------------
describe('computeSchemaCompleteness', () => {
  it('returns 100 for complete schema', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Corp',
      url: 'https://example.com',
      telephone: '+1234567890',
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('returns 0 for invalid JSON', () => {
    expect(computeSchemaCompleteness('not json')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(computeSchemaCompleteness('')).toBe(0);
  });

  it('scores missing @context', () => {
    const schema = JSON.stringify({
      '@type': 'Organization',
      name: 'Test',
      url: 'https://example.com',
      telephone: '+1234567890',
    });
    expect(computeSchemaCompleteness(schema)).toBe(80); // 4/5
  });

  it('scores missing name', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      url: 'https://example.com',
      telephone: '+1234567890',
    });
    expect(computeSchemaCompleteness(schema)).toBe(80);
  });

  it('scores missing contact info', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      url: 'https://example.com',
    });
    expect(computeSchemaCompleteness(schema)).toBe(80);
  });

  it('scores missing url/sameAs', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      telephone: '+1234567890',
    });
    expect(computeSchemaCompleteness(schema)).toBe(80);
  });

  it('accepts sameAs as alternative to url', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      sameAs: 'https://example.com',
      telephone: '+1234567890',
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('detects contact in publisher node', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Test Page',
      url: 'https://example.com',
      publisher: {
        '@type': 'Organization',
        telephone: '+1234567890',
      },
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('detects contact in contactPoint node', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      url: 'https://example.com',
      contactPoint: {
        telephone: '+1234567890',
      },
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('accepts email as contact', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      url: 'https://example.com',
      email: 'info@example.com',
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('accepts address as contact', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test',
      url: 'https://example.com',
      address: '123 Main St',
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('handles @graph arrays — prefers Organization node', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Page' },
        {
          '@type': 'Organization',
          name: 'Org',
          url: 'https://example.com',
          telephone: '+1234567890',
        },
      ],
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('handles @graph with LocalBusiness', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'LocalBusiness',
          name: 'Biz',
          url: 'https://example.com',
          telephone: '+1234567890',
        },
      ],
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('handles @graph with array @type', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['LocalBusiness', 'Store'],
          name: 'Shop',
          url: 'https://example.com',
          telephone: '+1234567890',
        },
      ],
    });
    expect(computeSchemaCompleteness(schema)).toBe(100);
  });

  it('falls back to first graph node when no Org/Business found', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: 'Page',
          url: 'https://example.com',
        },
      ],
    });
    // Missing contact → 80%
    expect(computeSchemaCompleteness(schema)).toBe(80);
  });

  it('returns 20 for minimal schema (only @context)', () => {
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
    });
    expect(computeSchemaCompleteness(schema)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// buildLlmsTxt
// ---------------------------------------------------------------------------
describe('buildLlmsTxt', () => {
  it('produces a well-formatted llms.txt', () => {
    const result = buildLlmsTxt('https://example.com', [
      '- [Home](/): Main page',
      '- [About](/about): About us',
    ]);
    expect(result).toContain('# example.com – GEO Content Directory');
    expect(result).toContain('> Machine-readable factual directory');
    expect(result).toContain('- [Home](/): Main page');
    expect(result).toContain('- [About](/about): About us');
  });

  it('filters out empty entries', () => {
    const result = buildLlmsTxt('https://example.com', ['', '- [Home](/): Main', '']);
    expect(result).toContain('- [Home](/): Main');
    const lines = result.split('\n').filter(Boolean);
    expect(lines.filter((l) => l.startsWith('-'))).toHaveLength(1);
  });

  it('trims whitespace from entries', () => {
    const result = buildLlmsTxt('https://example.com', ['  - [Home](/): Main  ']);
    expect(result).toContain('- [Home](/): Main');
  });

  it('handles empty entries array', () => {
    const result = buildLlmsTxt('https://example.com', []);
    expect(result).toContain('# example.com');
    expect(result).toContain('Machine-readable');
  });

  it('uses hostname in title', () => {
    const result = buildLlmsTxt('https://mysite.co.uk', []);
    expect(result).toContain('# mysite.co.uk');
  });
});

// ---------------------------------------------------------------------------
// aggregateResults
// ---------------------------------------------------------------------------
describe('aggregateResults', () => {
  function makePageResult(
    url: string,
    overrides: Partial<GeoPageAnalysis> = {}
  ): { page_url: string; result: GeoPageAnalysis } {
    return {
      page_url: url,
      result: {
        json_ld: '{"@context":"https://schema.org","@type":"Organization","name":"Test","url":"https://example.com","telephone":"+1234567890"}',
        llms_txt_entry: `- [Page](${new URL(url).pathname}): Content`,
        entity_clarity_score: 7,
        fact_density_count: 10,
        word_count: 500,
        content_quality_score: 7,
        semantic_structure_score: 7,
        entity_richness_score: 6,
        citation_readiness_score: 6,
        technical_seo_score: 7,
        user_intent_alignment_score: 7,
        trust_signals_score: 6,
        authority_score: 6,
        geo_recommendations: ['Add more facts', 'Include schema markup'],
        ...overrides,
      },
    };
  }

  it('throws for empty page results', () => {
    expect(() => aggregateResults('https://example.com', [])).toThrow('No analyzable pages');
  });

  it('returns correct structure for single page', () => {
    const results = [makePageResult('https://example.com/')];
    const aggregate = aggregateResults('https://example.com', results);

    expect(aggregate.primary_json_ld).toBeDefined();
    expect(aggregate.llms_txt).toContain('example.com');
    expect(aggregate.pages).toHaveLength(1);
    expect(aggregate.site_metrics.overall_grade).toBeDefined();
  });

  it('computes average entity clarity', () => {
    const results = [
      makePageResult('https://example.com/', { entity_clarity_score: 8 }),
      makePageResult('https://example.com/about', { entity_clarity_score: 6 }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.site_metrics.avg_entity_clarity).toBe(7);
  });

  it('computes total facts', () => {
    const results = [
      makePageResult('https://example.com/', { fact_density_count: 10 }),
      makePageResult('https://example.com/about', { fact_density_count: 5 }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.site_metrics.total_facts).toBe(15);
  });

  it('computes average words per fact', () => {
    const results = [
      makePageResult('https://example.com/', {
        fact_density_count: 10,
        word_count: 1000,
      }),
      makePageResult('https://example.com/about', {
        fact_density_count: 10,
        word_count: 1000,
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    // 2000 total words / 20 total facts = 100
    expect(aggregate.site_metrics.avg_words_per_fact).toBe(100);
  });

  it('uses total words as words_per_fact when no facts', () => {
    const results = [
      makePageResult('https://example.com/', {
        fact_density_count: 0,
        word_count: 500,
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.site_metrics.avg_words_per_fact).toBe(500);
  });

  it('prefers homepage for primary JSON-LD', () => {
    const results = [
      makePageResult('https://example.com/about', {
        json_ld: '{"@type":"AboutPage"}',
      }),
      makePageResult('https://example.com/', {
        json_ld: '{"@type":"Organization"}',
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.primary_json_ld).toContain('Organization');
  });

  it('falls back to first page when no homepage found', () => {
    const results = [
      makePageResult('https://example.com/page1', {
        json_ld: '{"@type":"WebPage1"}',
      }),
      makePageResult('https://example.com/page2', {
        json_ld: '{"@type":"WebPage2"}',
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.primary_json_ld).toContain('WebPage1');
  });

  it('deduplicates recommendations', () => {
    const results = [
      makePageResult('https://example.com/', {
        geo_recommendations: ['Add facts', 'Add schema'],
      }),
      makePageResult('https://example.com/about', {
        geo_recommendations: ['Add facts', 'Improve clarity'],
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    const recs = aggregate.site_metrics.priority_recommendations;
    // "Add facts" should appear only once
    expect(recs.filter((r) => r === 'Add facts')).toHaveLength(1);
  });

  it('limits priority recommendations to 5', () => {
    const manyRecs = Array.from({ length: 20 }, (_, i) => `Recommendation ${i}`);
    const results = [
      makePageResult('https://example.com/', {
        geo_recommendations: manyRecs,
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.site_metrics.priority_recommendations.length).toBeLessThanOrEqual(5);
  });

  it('identifies critical issues by keywords', () => {
    const results = [
      makePageResult('https://example.com/', {
        geo_recommendations: [
          'Missing contact information',
          'Add required schema fields',
          'Consider adding alt text',
          'Nice page design',
          'Ensure proper heading hierarchy',
        ],
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    const criticals = aggregate.site_metrics.critical_issues;
    // Should include the ones with keywords: missing, required, consider, ensure
    expect(criticals.some((c) => c.toLowerCase().includes('missing'))).toBe(true);
    expect(criticals.some((c) => c.toLowerCase().includes('required'))).toBe(true);
  });

  it('computes premium score from averaged metrics', () => {
    const results = [
      makePageResult('https://example.com/', {
        entity_clarity_score: 10,
        content_quality_score: 10,
        semantic_structure_score: 10,
        entity_richness_score: 10,
        citation_readiness_score: 10,
        technical_seo_score: 10,
        user_intent_alignment_score: 10,
        trust_signals_score: 10,
        authority_score: 10,
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    // 9 scores × 10 × 1.11 = 99.9 → rounded to 100
    expect(aggregate.site_metrics.premium_score).toBe(100);
  });

  it('computes all average premium fields', () => {
    const results = [
      makePageResult('https://example.com/', {
        content_quality_score: 8,
        semantic_structure_score: 7,
        entity_richness_score: 6,
        citation_readiness_score: 5,
        technical_seo_score: 9,
        user_intent_alignment_score: 8,
        trust_signals_score: 7,
        authority_score: 6,
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    const m = aggregate.site_metrics;
    expect(m.avg_content_quality).toBe(8);
    expect(m.avg_semantic_structure).toBe(7);
    expect(m.avg_entity_richness).toBe(6);
    expect(m.avg_citation_readiness).toBe(5);
    expect(m.avg_technical_seo).toBe(9);
    expect(m.avg_user_intent).toBe(8);
    expect(m.avg_trust_signals).toBe(7);
    expect(m.avg_authority).toBe(6);
  });

  it('builds llms.txt from page entries', () => {
    const results = [
      makePageResult('https://example.com/', {
        llms_txt_entry: '- [Home](/): Main page',
      }),
      makePageResult('https://example.com/about', {
        llms_txt_entry: '- [About](/about): About us',
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.llms_txt).toContain('- [Home](/): Main page');
    expect(aggregate.llms_txt).toContain('- [About](/about): About us');
  });

  it('computes schema completeness from primary JSON-LD', () => {
    const results = [
      makePageResult('https://example.com/', {
        json_ld: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Test',
          url: 'https://example.com',
          telephone: '+1234567890',
        }),
      }),
    ];
    const aggregate = aggregateResults('https://example.com', results);
    expect(aggregate.site_metrics.schema_completeness_score).toBe(100);
  });
});
