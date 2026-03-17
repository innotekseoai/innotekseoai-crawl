import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '@/lib/crawler/url-normalize';

describe('normalizeUrl', () => {
  it('strips UTM tracking params', () => {
    expect(normalizeUrl('https://example.com/page?utm_source=google&utm_medium=cpc'))
      .toBe('https://example.com/page');
  });

  it('strips fbclid', () => {
    expect(normalizeUrl('https://example.com/?fbclid=abc123'))
      .toBe('https://example.com/');
  });

  it('strips gclid but keeps non-tracking params', () => {
    expect(normalizeUrl('https://example.com/search?q=test&gclid=xyz'))
      .toBe('https://example.com/search?q=test');
  });

  it('lowercases hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Path'))
      .toBe('https://example.com/Path');
  });

  it('sorts query params alphabetically', () => {
    expect(normalizeUrl('https://example.com/?z=1&a=2&m=3'))
      .toBe('https://example.com/?a=2&m=3&z=1');
  });

  it('removes trailing slash (non-root)', () => {
    expect(normalizeUrl('https://example.com/about/'))
      .toBe('https://example.com/about');
  });

  it('preserves root trailing slash', () => {
    expect(normalizeUrl('https://example.com/'))
      .toBe('https://example.com/');
  });

  it('removes fragment', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  it('removes default port 443 for https', () => {
    expect(normalizeUrl('https://example.com:443/page'))
      .toBe('https://example.com/page');
  });

  it('removes default port 80 for http', () => {
    expect(normalizeUrl('http://example.com:80/page'))
      .toBe('http://example.com/page');
  });

  it('keeps non-default ports', () => {
    expect(normalizeUrl('https://example.com:8080/page'))
      .toBe('https://example.com:8080/page');
  });

  it('resolves relative URLs with base', () => {
    expect(normalizeUrl('/about', 'https://example.com'))
      .toBe('https://example.com/about');
  });

  it('returns null for non-http protocols', () => {
    expect(normalizeUrl('ftp://example.com')).toBeNull();
    expect(normalizeUrl('mailto:user@example.com')).toBeNull();
    expect(normalizeUrl('javascript:void(0)')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull();
  });

  it('handles URLs with no query params', () => {
    expect(normalizeUrl('https://example.com/page'))
      .toBe('https://example.com/page');
  });

  it('removes empty query string after stripping params', () => {
    expect(normalizeUrl('https://example.com/page?utm_source=google'))
      .toBe('https://example.com/page');
  });

  it('handles multiple tracking params mixed with real params', () => {
    const result = normalizeUrl('https://example.com/page?category=shoes&utm_source=g&color=red&fbclid=abc&size=10');
    expect(result).toBe('https://example.com/page?category=shoes&color=red&size=10');
  });
});
