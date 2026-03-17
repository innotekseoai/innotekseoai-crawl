import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeoPageAnalysis } from '../../../src/types/analysis.js';

// We need to mock modelManager since node-llama-cpp isn't available in tests
const mockInference = vi.fn();
const mockIsLoaded = vi.fn();

vi.mock('../../../src/lib/ai/model-manager.js', () => ({
  modelManager: {
    inference: (...args: unknown[]) => mockInference(...args),
    isLoaded: () => mockIsLoaded(),
  },
}));

// Import after mock
const { analyzePageForGeo } = await import('../../../src/lib/ai/analyzer.js');

const validAnalysis: GeoPageAnalysis = {
  json_ld: '{"@context":"https://schema.org","@type":"WebPage","name":"Test"}',
  llms_txt_entry: '- [Test Page](/test): A test page for verification',
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
  geo_recommendations: ['Add founding year', 'Include contact details'],
};

describe('analyzePageForGeo', () => {
  const input = {
    url: 'https://example.com/test',
    markdown: '# Test Page\n\nThis is test content with some facts. Founded in 2019.',
    baseUrl: 'https://example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if no model is loaded', async () => {
    mockIsLoaded.mockReturnValue(false);

    await expect(analyzePageForGeo(input)).rejects.toThrow('No model loaded');
  });

  it('returns validated analysis from valid model output', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue(JSON.stringify(validAnalysis));

    const result = await analyzePageForGeo(input);

    expect(result.entity_clarity_score).toBe(7);
    expect(result.fact_density_count).toBe(5);
    expect(result.word_count).toBe(200);
    expect(result.geo_recommendations).toHaveLength(2);
    expect(result.json_ld).toContain('schema.org');
  });

  it('handles model output wrapped in markdown fences', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue(
      '```json\n' + JSON.stringify(validAnalysis) + '\n```'
    );

    const result = await analyzePageForGeo(input);
    expect(result.entity_clarity_score).toBe(7);
  });

  it('retries on first JSON parse failure', async () => {
    mockIsLoaded.mockReturnValue(true);
    // First call returns garbage, second returns valid JSON
    mockInference
      .mockResolvedValueOnce('not valid json at all')
      .mockResolvedValueOnce(JSON.stringify(validAnalysis));

    const result = await analyzePageForGeo(input);
    expect(result.entity_clarity_score).toBe(7);
    expect(mockInference).toHaveBeenCalledTimes(2);
  });

  it('throws after two parse failures', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('still not json');

    await expect(analyzePageForGeo(input)).rejects.toThrow('Failed to parse AI response');
  });

  it('applies defaults for missing optional fields and validates', async () => {
    mockIsLoaded.mockReturnValue(true);

    // Return partial analysis — some required fields present, some missing
    const partial = {
      json_ld: '{"@type":"WebPage"}',
      llms_txt_entry: '- [Test](/test): test',
      entity_clarity_score: 8,
      fact_density_count: 3,
      word_count: 100,
      // Missing all premium metrics
      geo_recommendations: ['Do something'],
    };
    mockInference.mockResolvedValue(JSON.stringify(partial));

    const result = await analyzePageForGeo(input);

    // Should fill in defaults for missing fields
    expect(result.entity_clarity_score).toBe(8); // from model
    expect(result.content_quality_score).toBe(5); // default
    expect(result.semantic_structure_score).toBe(5); // default
    expect(result.geo_recommendations).toEqual(['Do something']); // from model
  });

  it('preserves mirror_markdown when provided', async () => {
    mockIsLoaded.mockReturnValue(true);
    const withMirror = {
      ...validAnalysis,
      mirror_markdown: '# Clean Content\n\nJust the facts.',
    };
    mockInference.mockResolvedValue(JSON.stringify(withMirror));

    const result = await analyzePageForGeo(input);
    expect(result.mirror_markdown).toBe('# Clean Content\n\nJust the facts.');
  });

  it('passes GEO_JSON_SCHEMA to model inference', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue(JSON.stringify(validAnalysis));

    await analyzePageForGeo(input);

    // Second arg should be the JSON schema
    const schemaArg = mockInference.mock.calls[0][1];
    expect(schemaArg).toBeDefined();
    expect(schemaArg.type).toBe('object');
    expect(schemaArg.properties).toBeDefined();
  });

  it('sends system and user messages to inference', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue(JSON.stringify(validAnalysis));

    await analyzePageForGeo(input);

    const messages = mockInference.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain(input.url);
  });
});
