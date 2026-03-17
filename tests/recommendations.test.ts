import { describe, it, expect } from 'vitest';
import { processRecommendations, groupByCategory } from '@/lib/ai/recommendations';

describe('processRecommendations', () => {
  it('deduplicates similar recommendations', () => {
    const recs = [
      'Add schema markup to improve SEO',
      'Add Schema Markup To Improve SEO',
      'Add schema markup to improve SEO.',
    ];
    const result = processRecommendations(recs);
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe(3);
  });

  it('parses impact levels from brackets', () => {
    const recs = ['[high] Add JSON-LD schema', '[low] Fix minor typo'];
    const result = processRecommendations(recs);
    const high = result.find(r => r.text.includes('JSON-LD'));
    const low = result.find(r => r.text.includes('typo'));
    expect(high?.impact).toBe('high');
    expect(low?.impact).toBe('low');
  });

  it('defaults to medium impact when not specified', () => {
    const result = processRecommendations(['Improve content quality']);
    expect(result[0].impact).toBe('medium');
  });

  it('categorizes recommendations correctly', () => {
    const recs = [
      'Add JSON-LD structured data',
      'Fix meta title length',
      'Add customer testimonials',
      'Improve content readability',
    ];
    const result = processRecommendations(recs);
    const schemaRec = result.find(r => r.text.includes('JSON-LD'));
    const techRec = result.find(r => r.text.includes('meta title'));
    const trustRec = result.find(r => r.text.includes('testimonials'));
    const contentRec = result.find(r => r.text.includes('readability'));

    expect(schemaRec?.category).toBe('Schema');
    expect(techRec?.category).toBe('Technical');
    expect(trustRec?.category).toBe('Trust');
    expect(contentRec?.category).toBe('Content');
  });

  it('sorts by impact * frequency', () => {
    const recs = [
      '[low] Minor fix A',
      '[high] Critical issue',
      '[high] Critical issue',
      '[medium] Normal suggestion',
    ];
    const result = processRecommendations(recs);
    expect(result[0].text).toContain('Critical issue');
    expect(result[0].frequency).toBe(2);
  });

  it('upgrades impact on dedup if higher', () => {
    const recs = [
      '[low] Add schema markup',
      '[high] Add schema markup',
    ];
    const result = processRecommendations(recs);
    expect(result[0].impact).toBe('high');
  });

  it('handles empty input', () => {
    expect(processRecommendations([])).toEqual([]);
  });

  it('handles null/empty strings', () => {
    const recs = ['', '  ', 'Valid recommendation'];
    const result = processRecommendations(recs);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Valid recommendation');
  });
});

describe('groupByCategory', () => {
  it('groups recommendations into categories', () => {
    const processed = processRecommendations([
      'Add JSON-LD structured data',
      'Fix meta title',
      'Add testimonials',
      'Improve keyword density',
    ]);
    const groups = groupByCategory(processed);
    expect(groups.Schema.length).toBeGreaterThanOrEqual(1);
    expect(groups.Technical.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty arrays for unused categories', () => {
    const groups = groupByCategory([]);
    expect(groups.Content).toEqual([]);
    expect(groups.Technical).toEqual([]);
    expect(groups.Schema).toEqual([]);
    expect(groups.Trust).toEqual([]);
  });
});
