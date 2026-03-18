/**
 * Type-specific JSON-LD schema generators
 *
 * Uses detectSchemaType() to identify the page type, then builds
 * a richer schema with type-appropriate properties extracted from
 * the markdown content.
 */

import { detectSchemaType } from './schema-detect';

interface SchemaInput {
  url: string;
  markdown: string;
  title?: string;
}

function getDescription(markdown: string): string {
  // First non-heading, non-empty paragraph
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('-')) continue;
    if (trimmed.length > 30) {
      return trimmed.slice(0, 200);
    }
  }
  return '';
}

function getTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)/m);
  return match ? match[1].trim().slice(0, 100) : 'Page';
}

function extractDatePublished(markdown: string): string | null {
  // Look for common date patterns
  const patterns = [
    /(?:published|posted|date|written)\s*[:\-]?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\w+\s+\d{1,2},?\s+\d{4})/,
  ];
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      try {
        const d = new Date(match[1]);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } catch { /* ignore */ }
    }
  }
  return null;
}

function extractAuthor(markdown: string): string | null {
  const match = markdown.match(/(?:by|author|written by)\s*[:\-]?\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
  return match ? match[1].trim() : null;
}

function extractPrice(markdown: string): string | null {
  const match = markdown.match(/\$(\d+(?:\.\d{1,2})?)/);
  return match ? match[1] : null;
}

function extractFaqPairs(markdown: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match "## Question?" or "### Question?" headings
    const qMatch = line.match(/^#{1,3}\s+(.+\?)\s*$/);
    if (qMatch) {
      // Collect answer from following lines
      const answerLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.startsWith('#') || (answerLines.length > 0 && !next)) break;
        if (next) answerLines.push(next);
      }
      if (answerLines.length > 0) {
        pairs.push({ question: qMatch[1], answer: answerLines.join(' ').slice(0, 300) });
      }
    }
  }
  return pairs.slice(0, 10);
}

function buildArticleSchema(input: SchemaInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: getTitle(input.markdown).slice(0, 110),
    url: input.url,
    description: getDescription(input.markdown),
  };

  const date = extractDatePublished(input.markdown);
  if (date) schema.datePublished = date;

  const author = extractAuthor(input.markdown);
  if (author) schema.author = { '@type': 'Person', name: author };

  return schema;
}

function buildProductSchema(input: SchemaInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: getTitle(input.markdown),
    url: input.url,
    description: getDescription(input.markdown),
  };

  const price = extractPrice(input.markdown);
  if (price) {
    schema.offers = {
      '@type': 'Offer',
      price: price.replace(/[$,]/g, ''),
      priceCurrency: 'USD',
    };
  }

  return schema;
}

function buildFaqSchema(input: SchemaInput): Record<string, unknown> {
  const pairs = extractFaqPairs(input.markdown);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    name: getTitle(input.markdown),
    url: input.url,
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.question,
      acceptedAnswer: { '@type': 'Answer', text: p.answer },
    })),
  };
}

function buildOrganizationSchema(input: SchemaInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: getTitle(input.markdown),
    url: input.url,
    description: getDescription(input.markdown),
  };

  const foundingMatch = input.markdown.match(/(?:founded|established|since)\s*(?:in\s+)?(\d{4})/i);
  if (foundingMatch) schema.foundingDate = foundingMatch[1];

  return schema;
}

function buildDefaultSchema(input: SchemaInput, schemaType: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: getTitle(input.markdown),
    url: input.url,
    description: getDescription(input.markdown),
  };
}

/**
 * Generate a rich JSON-LD schema based on detected page type.
 */
export function generateRichJsonLd(input: SchemaInput): string {
  const schemaType = detectSchemaType({ url: input.url, markdown: input.markdown, title: input.title });

  let schema: Record<string, unknown>;

  switch (schemaType) {
    case 'Article':
      schema = buildArticleSchema(input);
      break;
    case 'Product':
      schema = buildProductSchema(input);
      break;
    case 'FAQPage':
      schema = buildFaqSchema(input);
      break;
    case 'Organization':
      schema = buildOrganizationSchema(input);
      break;
    default:
      schema = buildDefaultSchema(input, schemaType);
      break;
  }

  return JSON.stringify(schema);
}

/**
 * Return the detected schema type for a page.
 */
export { detectSchemaType } from './schema-detect';
