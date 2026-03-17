import { describe, it, expect } from 'vitest';
import { repairJson, safeJsonParse } from '../../../src/lib/ai/json-repair.js';

// ---------------------------------------------------------------------------
// repairJson
// ---------------------------------------------------------------------------
describe('repairJson', () => {
  it('returns valid JSON unchanged', () => {
    const input = '{"key": "value"}';
    expect(repairJson(input)).toBe(input);
  });

  it('strips ```json fences', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(repairJson(input)).toBe('{"key": "value"}');
  });

  it('strips bare ``` fences (no language tag)', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(repairJson(input)).toBe('{"key": "value"}');
  });

  it('strips leading prose before the first {', () => {
    const input = 'Here is the result:\n{"key": "value"}';
    expect(repairJson(input)).toBe('{"key": "value"}');
  });

  it('strips leading prose before the first [', () => {
    const input = 'Output: [1, 2, 3]';
    expect(repairJson(input)).toBe('[1, 2, 3]');
  });

  it('strips trailing prose after the last }', () => {
    const input = '{"key": "value"}\nHope that helps!';
    expect(repairJson(input)).toBe('{"key": "value"}');
  });

  it('strips trailing prose after the last ]', () => {
    const input = '[1, 2, 3]\nDone.';
    expect(repairJson(input)).toBe('[1, 2, 3]');
  });

  it('fixes trailing comma before }', () => {
    const input = '{"a": 1, "b": 2,}';
    expect(repairJson(input)).toBe('{"a": 1, "b": 2}');
  });

  it('fixes trailing comma before ]', () => {
    const input = '[1, 2, 3,]';
    expect(repairJson(input)).toBe('[1, 2, 3]');
  });

  it('fixes trailing comma with whitespace before }', () => {
    const input = '{"a": 1,  \n}';
    expect(repairJson(input)).toBe('{"a": 1}');
  });

  it('handles nested trailing commas', () => {
    const input = '{"arr": [1, 2,], "obj": {"x": 1,},}';
    const result = repairJson(input);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(JSON.parse(result)).toEqual({ arr: [1, 2], obj: { x: 1 } });
  });

  it('handles markdown fences + leading text + trailing commas combined', () => {
    const input = '```json\nHere it is: {"a": 1,}\n```';
    const result = repairJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('trims whitespace from input', () => {
    const input = '  \n  {"key": "value"}  \n  ';
    expect(repairJson(input)).toBe('{"key": "value"}');
  });

  it('preserves valid inner content with braces in strings', () => {
    const input = '{"template": "Hello {name}"}';
    const result = repairJson(input);
    expect(result).toBe(input);
  });

  it('handles empty object', () => {
    expect(repairJson('{}')).toBe('{}');
  });

  it('handles empty array', () => {
    expect(repairJson('[]')).toBe('[]');
  });

  it('handles deeply nested JSON', () => {
    const input = '{"a": {"b": {"c": [1, 2, {"d": true,},],},},}';
    const result = repairJson(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------
describe('safeJsonParse', () => {
  it('parses valid JSON directly', () => {
    const result = safeJsonParse('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON arrays', () => {
    const result = safeJsonParse('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('repairs and parses wrapped JSON', () => {
    const result = safeJsonParse('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('repairs and parses JSON with trailing commas', () => {
    const result = safeJsonParse('{"a": 1, "b": 2,}');
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('repairs and parses JSON with leading prose', () => {
    const result = safeJsonParse('The result is: {"score": 8}');
    expect(result).toEqual({ score: 8 });
  });

  it('returns null for completely invalid input', () => {
    expect(safeJsonParse('not json at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeJsonParse('')).toBeNull();
  });

  it('returns null for partial JSON', () => {
    expect(safeJsonParse('{"key": ')).toBeNull();
  });

  it('parses numbers', () => {
    expect(safeJsonParse('42')).toBe(42);
  });

  it('parses strings', () => {
    expect(safeJsonParse('"hello"')).toBe('hello');
  });

  it('parses booleans', () => {
    expect(safeJsonParse('true')).toBe(true);
  });

  it('parses null', () => {
    expect(safeJsonParse('null')).toBeNull();
  });

  it('handles complex model output with markdown fences and trailing commas', () => {
    const modelOutput = `Sure! Here is the analysis:

\`\`\`json
{
  "entity_clarity_score": 7,
  "fact_density_count": 12,
  "word_count": 450,
  "geo_recommendations": [
    "Add founding year",
    "Include certifications",
  ],
}
\`\`\`

Let me know if you need anything else!`;
    const result = safeJsonParse(modelOutput);
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).entity_clarity_score).toBe(7);
    expect((result as Record<string, unknown>).fact_density_count).toBe(12);
  });
});
