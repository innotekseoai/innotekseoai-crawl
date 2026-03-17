import { describe, it, expect } from 'vitest';
import { GeoPageAnalysisSchema } from '../../src/types/analysis.js';

describe('GeoPageAnalysisSchema', () => {
  const validData = {
    json_ld: '{"@context":"https://schema.org"}',
    llms_txt_entry: '- [Test](/test): A test page',
    entity_clarity_score: 7,
    fact_density_count: 5,
    word_count: 200,
    content_quality_score: 6,
    semantic_structure_score: 7,
    entity_richness_score: 5,
    citation_readiness_score: 6,
    technical_seo_score: 7,
    user_intent_alignment_score: 8,
    trust_signals_score: 6,
    authority_score: 5,
    geo_recommendations: ['Add founding year'],
  };

  // -----------------------------------------------------------------------
  // Valid data
  // -----------------------------------------------------------------------
  it('accepts valid complete data', () => {
    const result = GeoPageAnalysisSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('accepts data with optional mirror_markdown', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      mirror_markdown: '# Clean content',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mirror_markdown).toBe('# Clean content');
    }
  });

  it('accepts data without mirror_markdown', () => {
    const { mirror_markdown, ...withoutMirror } = { ...validData, mirror_markdown: 'x' };
    const result = GeoPageAnalysisSchema.safeParse(withoutMirror);
    expect(result.success).toBe(true);
  });

  it('accepts empty recommendations array', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      geo_recommendations: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero for fact_density_count', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      fact_density_count: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero for word_count', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      word_count: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimum score of 1', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 1,
      content_quality_score: 1,
      semantic_structure_score: 1,
      entity_richness_score: 1,
      citation_readiness_score: 1,
      technical_seo_score: 1,
      user_intent_alignment_score: 1,
      trust_signals_score: 1,
      authority_score: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts maximum score of 10', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 10,
      content_quality_score: 10,
      semantic_structure_score: 10,
      entity_richness_score: 10,
      citation_readiness_score: 10,
      technical_seo_score: 10,
      user_intent_alignment_score: 10,
      trust_signals_score: 10,
      authority_score: 10,
    });
    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Invalid: missing required fields
  // -----------------------------------------------------------------------
  it('rejects missing json_ld', () => {
    const { json_ld, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing llms_txt_entry', () => {
    const { llms_txt_entry, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing entity_clarity_score', () => {
    const { entity_clarity_score, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing fact_density_count', () => {
    const { fact_density_count, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing word_count', () => {
    const { word_count, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing geo_recommendations', () => {
    const { geo_recommendations, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing content_quality_score', () => {
    const { content_quality_score, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing semantic_structure_score', () => {
    const { semantic_structure_score, ...data } = validData;
    expect(GeoPageAnalysisSchema.safeParse(data).success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Invalid: out of range
  // -----------------------------------------------------------------------
  it('rejects entity_clarity_score below 1', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects entity_clarity_score above 10', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 11,
    });
    expect(result.success).toBe(false);
  });

  it('rejects content_quality_score below 1', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      content_quality_score: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects content_quality_score above 10', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      content_quality_score: 11,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative fact_density_count', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      fact_density_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative word_count', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      word_count: -1,
    });
    expect(result.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Invalid: wrong types
  // -----------------------------------------------------------------------
  it('rejects string for entity_clarity_score', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 'high',
    });
    expect(result.success).toBe(false);
  });

  it('rejects number for json_ld', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      json_ld: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects string for geo_recommendations', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      geo_recommendations: 'not an array',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string items in geo_recommendations', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      geo_recommendations: [42, true],
    });
    expect(result.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('rejects null', () => {
    expect(GeoPageAnalysisSchema.safeParse(null).success).toBe(false);
  });

  it('rejects undefined', () => {
    expect(GeoPageAnalysisSchema.safeParse(undefined).success).toBe(false);
  });

  it('rejects empty object', () => {
    expect(GeoPageAnalysisSchema.safeParse({}).success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      unknown_field: 'should be stripped',
    });
    expect(result.success).toBe(true);
  });

  it('accepts decimal scores', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      entity_clarity_score: 7.5,
      content_quality_score: 6.3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts large word counts', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      word_count: 100000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts large fact counts', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      fact_density_count: 500,
    });
    expect(result.success).toBe(true);
  });

  it('accepts many recommendations', () => {
    const result = GeoPageAnalysisSchema.safeParse({
      ...validData,
      geo_recommendations: Array.from({ length: 50 }, (_, i) => `Rec ${i}`),
    });
    expect(result.success).toBe(true);
  });
});
