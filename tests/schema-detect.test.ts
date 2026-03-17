import { describe, it, expect } from 'vitest';
import { detectSchemaType } from '@/lib/ai/schema-detect';

describe('detectSchemaType', () => {
  it('detects homepage as WebSite', () => {
    expect(detectSchemaType({ url: 'https://example.com/', markdown: 'Welcome', title: 'Home' }))
      .toBe('WebSite');
  });

  it('detects blog posts as Article', () => {
    expect(detectSchemaType({ url: 'https://example.com/blog/my-post', markdown: 'Content', title: 'Post' }))
      .toBe('Article');
  });

  it('detects date-based paths as Article', () => {
    expect(detectSchemaType({ url: 'https://example.com/2024/03/news-item', markdown: '', title: '' }))
      .toBe('Article');
  });

  it('detects product pages', () => {
    expect(detectSchemaType({ url: 'https://example.com/product/widget-123', markdown: '', title: '' }))
      .toBe('Product');
  });

  it('detects FAQ pages by URL', () => {
    expect(detectSchemaType({ url: 'https://example.com/faq', markdown: '', title: '' }))
      .toBe('FAQPage');
  });

  it('detects FAQ pages by content (many questions)', () => {
    const md = `## What is this?\nAnswer.\n\n## How does it work?\nExplanation.\n\n## Why choose us?\nReasons.\n\n## Can I cancel?\nYes.`;
    expect(detectSchemaType({ url: 'https://example.com/help', markdown: md, title: 'Help' }))
      .toBe('FAQPage');
  });

  it('detects about pages', () => {
    expect(detectSchemaType({ url: 'https://example.com/about-us', markdown: '', title: '' }))
      .toBe('AboutPage');
  });

  it('detects contact pages', () => {
    expect(detectSchemaType({ url: 'https://example.com/contact', markdown: '', title: '' }))
      .toBe('ContactPage');
  });

  it('detects Product by content patterns', () => {
    const md = 'Buy now for $49.99. Add to cart. Free shipping on all products.';
    expect(detectSchemaType({ url: 'https://example.com/items/shoe', markdown: md, title: '' }))
      .toBe('Product');
  });

  it('falls back to WebPage for generic content', () => {
    expect(detectSchemaType({ url: 'https://example.com/some-random-page', markdown: 'Generic content.', title: '' }))
      .toBe('WebPage');
  });

  it('handles invalid URLs gracefully', () => {
    expect(detectSchemaType({ url: 'not-a-url', markdown: '', title: '' }))
      .toBe('WebPage');
  });

  it('detects Organization by content', () => {
    const md = 'Our mission is to innovate. Founded in 2010, our team has grown to 50 people at our headquarters.';
    expect(detectSchemaType({ url: 'https://example.com/company', markdown: md, title: '' }))
      .toBe('Organization');
  });
});
