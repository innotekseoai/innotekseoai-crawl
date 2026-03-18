import { describe, it, expect } from 'vitest';
import { generateRichJsonLd } from '../src/lib/ai/schema-generator';

describe('schema-generator', () => {
  it('generates Article schema for blog posts', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/blog/my-post',
      markdown: '# My Blog Post\n\nThis is a long description of the blog post content that provides value.\n\nPublished: March 15, 2026\n\nBy John Smith',
    }));

    expect(result['@type']).toBe('Article');
    expect(result.headline).toBe('My Blog Post');
    expect(result.datePublished).toBe('2026-03-15');
    expect(result.author?.name).toBe('John Smith');
  });

  it('generates Product schema with price', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/product/widget',
      markdown: '# Widget Pro\n\nThe best widget on the market. Only $49.99. Buy now!',
    }));

    expect(result['@type']).toBe('Product');
    expect(result.name).toBe('Widget Pro');
    expect(result.offers?.price).toBe('49.99');
  });

  it('generates FAQPage schema from Q&A headings', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/faq',
      markdown: '# FAQ\n\n## What is this product?\n\nIt is a great product.\n\n## How much does it cost?\n\nIt costs $10.',
    }));

    expect(result['@type']).toBe('FAQPage');
    expect(result.mainEntity).toHaveLength(2);
    expect(result.mainEntity[0].name).toBe('What is this product?');
    expect(result.mainEntity[0].acceptedAnswer.text).toContain('great product');
  });

  it('generates AboutPage schema for /about pages', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/about',
      markdown: '# About Us\n\nWe are a company founded in 2015. Our mission is to build great products.',
    }));

    // /about matches the AboutPage URL pattern first
    expect(result['@type']).toBe('AboutPage');
    expect(result.description).toContain('company');
  });

  it('generates Organization schema for content-detected org pages', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/company',
      markdown: '# Our Company\n\nOur team was founded in 2010. Our mission is excellence. Our headquarters is in NYC.',
    }));

    expect(result['@type']).toBe('Organization');
    expect(result.foundingDate).toBe('2010');
  });

  it('generates WebSite schema for homepage', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/',
      markdown: '# Example Company\n\nWelcome to our website with lots of information about our services.',
    }));

    expect(result['@type']).toBe('WebSite');
    expect(result.url).toBe('https://example.com/');
  });

  it('defaults to WebPage for unclassifiable pages', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/random-page',
      markdown: '# Random Page\n\nSome content.',
    }));

    expect(result['@type']).toBe('WebPage');
    expect(result.url).toBe('https://example.com/random-page');
  });

  it('always includes @context, name, and url', () => {
    const result = JSON.parse(generateRichJsonLd({
      url: 'https://example.com/test',
      markdown: '# Test\n\nContent.',
    }));

    expect(result['@context']).toBe('https://schema.org');
    expect(result.url).toBe('https://example.com/test');
    expect(result.name).toBeDefined();
  });
});
