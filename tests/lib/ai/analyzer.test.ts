import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeoPageAnalysis } from '../../../src/types/analysis.js';

// Mock all inference backends
const mockInference = vi.fn();
const mockIsLoaded = vi.fn();

vi.mock('../../../src/lib/ai/model-manager.js', () => ({
  modelManager: {
    inference: (...args: unknown[]) => mockInference(...args),
    isLoaded: () => mockIsLoaded(),
  },
}));

vi.mock('../../../src/lib/ai/server-inference.js', () => ({
  isServerHealthy: () => Promise.resolve(false),
  isServerBinaryAvailable: () => false,
  startServer: vi.fn(),
  stopServer: vi.fn(),
  ensureServerModel: vi.fn(),
  getServerModelName: vi.fn(),
  serverInference: vi.fn(),
}));

vi.mock('../../../src/lib/ai/subprocess-inference.js', () => ({
  isSubprocessAvailable: () => false,
  subprocessInference: vi.fn(),
  stopSession: vi.fn(),
}));

// Import after mocks
const { analyzePageForGeo } = await import('../../../src/lib/ai/analyzer.js');

describe('analyzePageForGeo', () => {
  const input = {
    url: 'https://example.com/test',
    markdown: '# Test Page\n\nThis is test content with some facts. Founded in 2019.',
    baseUrl: 'https://example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if no model is loaded and no server available', async () => {
    mockIsLoaded.mockReturnValue(false);
    await expect(analyzePageForGeo(input)).rejects.toThrow('No model loaded');
  });

  it('parses score format response correctly', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue(
      `entity_clarity: 8
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
summary: Test page summary
rec1: [high] Add structured data`
    );

    const result = await analyzePageForGeo(input);
    expect(result.entity_clarity_score).toBe(8);
    expect(result.content_quality_score).toBe(7);
    expect(result.technical_seo_score).toBe(8);
    expect(result.fact_density_count).toBe(12);
    expect(result.confidence_score).toBeGreaterThan(0);
  });

  it('falls back to JSON parse when score format fails', async () => {
    mockIsLoaded.mockReturnValue(true);
    const validJson: GeoPageAnalysis = {
      json_ld: '{"@type":"WebPage"}',
      llms_txt_entry: '- [Test](/test): test',
      entity_clarity_score: 8,
      fact_density_count: 3,
      word_count: 100,
      content_quality_score: 7,
      semantic_structure_score: 6,
      entity_richness_score: 5,
      citation_readiness_score: 6,
      technical_seo_score: 7,
      user_intent_alignment_score: 8,
      trust_signals_score: 6,
      authority_score: 5,
      geo_recommendations: ['Improve schema'],
    };
    mockInference.mockResolvedValue(JSON.stringify(validJson));

    const result = await analyzePageForGeo(input);
    expect(result.entity_clarity_score).toBe(8);
    expect(result.geo_recommendations).toEqual(['Improve schema']);
  });

  it('falls back to number extraction as last resort', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('The scores are 7 8 6 5 7 8 6 7 5');

    const result = await analyzePageForGeo(input);
    // Should extract numbers and map to scores
    expect(result.entity_clarity_score).toBe(7);
    expect(result.content_quality_score).toBe(8);
  });

  it('returns defaults when model output is unparseable', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('completely useless output with no numbers');

    const result = await analyzePageForGeo(input);
    // Should return default scores (5)
    expect(result.entity_clarity_score).toBe(5);
    expect(result.content_quality_score).toBe(5);
    expect(result.confidence_score).toBe(0);
  });

  it('never re-runs inference on parse failure', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('garbage');

    await analyzePageForGeo(input);
    // Inference should only be called ONCE regardless of parse outcome
    expect(mockInference).toHaveBeenCalledTimes(1);
  });

  it('detects schema type from URL', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('entity_clarity: 7\ncontent_quality: 6\nsemantic_structure: 5\nentity_richness: 6\ncitation_readiness: 4\ntechnical_seo: 7\nuser_intent: 6\ntrust_signals: 5\nauthority: 6');

    const result = await analyzePageForGeo({
      ...input,
      url: 'https://example.com/blog/my-post',
    });
    const jsonLd = JSON.parse(result.json_ld);
    expect(jsonLd['@type']).toBe('Article');
  });

  it('uses smart truncation for long content', async () => {
    mockIsLoaded.mockReturnValue(true);
    mockInference.mockResolvedValue('entity_clarity: 7\ncontent_quality: 6\nsemantic_structure: 5\nentity_richness: 6\ncitation_readiness: 4\ntechnical_seo: 7\nuser_intent: 6\ntrust_signals: 5\nauthority: 6');

    const longContent = '# Title\n\n' + 'Paragraph content. '.repeat(500);
    const result = await analyzePageForGeo({
      ...input,
      markdown: longContent,
    });

    // Should still work — truncation handled internally
    expect(result.entity_clarity_score).toBe(7);
  });
});
