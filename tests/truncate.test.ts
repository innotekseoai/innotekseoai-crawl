import { describe, it, expect } from 'vitest';
import { smartTruncate } from '@/lib/ai/truncate';

describe('smartTruncate', () => {
  it('returns short content unchanged', () => {
    const md = '# Hello\n\nShort content.';
    expect(smartTruncate(md, 2000)).toBe(md);
  });

  it('truncates long content with [truncated] marker', () => {
    const md = 'A'.repeat(3000);
    const result = smartTruncate(md, 200);
    expect(result.length).toBeLessThanOrEqual(220); // budget + marker
    expect(result).toContain('[truncated]');
  });

  it('preserves intro section (highest priority)', () => {
    const md = `This is the important intro paragraph with key information.

## About
About section content here.

## Blog Archive
Long blog archive content that is less important. ${'x'.repeat(2000)}`;

    const result = smartTruncate(md, 300);
    expect(result).toContain('important intro');
  });

  it('prioritizes key business sections', () => {
    const md = `# Page

## Random Section
${'x'.repeat(500)}

## About
About our company. We do great things.

## Services
We offer consulting and development.

## Another Section
${'y'.repeat(500)}`;

    const result = smartTruncate(md, 400);
    // About and Services are high priority, should be included
    expect(result).toContain('About');
    expect(result).toContain('Services');
  });

  it('truncates at sentence boundaries', () => {
    const md = `# Title

This is a complete sentence. This is another sentence. This sentence gets cut off somewhere in the middle of a very long run of text that goes on and on.`;

    const result = smartTruncate(md, 120);
    // Should end with truncated marker
    expect(result).toContain('[truncated]');
    // Should not contain the last part of the content
    expect(result).not.toContain('goes on and on');
  });

  it('handles empty markdown', () => {
    expect(smartTruncate('', 2000)).toBe('');
  });

  it('handles markdown with no headings', () => {
    const md = 'Just plain text without any headings. '.repeat(100);
    const result = smartTruncate(md, 200);
    expect(result.length).toBeLessThanOrEqual(220);
    expect(result).toContain('[truncated]');
  });

  it('handles single section document', () => {
    const md = `# Only One Section\n\n${'Content. '.repeat(300)}`;
    const result = smartTruncate(md, 300);
    expect(result).toContain('[truncated]');
    expect(result.length).toBeLessThanOrEqual(320);
  });
});
