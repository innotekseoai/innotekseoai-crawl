/**
 * Context-aware markdown truncation for AI analysis
 *
 * Instead of naive slice(0, N), this:
 * 1. Splits markdown into sections by headings
 * 2. Prioritizes intro + key business sections (about, services, pricing)
 * 3. Truncates at sentence boundaries to preserve coherence
 */

interface Section {
  heading: string;
  content: string;
  priority: number;
  originalIndex: number;
}

/** Sections most relevant for GEO/SEO scoring */
const HIGH_PRIORITY_PATTERNS = [
  /about/i, /services?/i, /pricing/i, /products?/i, /features?/i,
  /solutions?/i, /contact/i, /faq/i, /testimonials?/i, /reviews?/i,
];

const MEDIUM_PRIORITY_PATTERNS = [
  /team/i, /blog/i, /news/i, /partners?/i, /clients?/i, /portfolio/i,
  /how\s+it\s+works/i, /benefits?/i, /overview/i,
];

function scorePriority(heading: string): number {
  if (HIGH_PRIORITY_PATTERNS.some((p) => p.test(heading))) return 3;
  if (MEDIUM_PRIORITY_PATTERNS.some((p) => p.test(heading))) return 2;
  return 1;
}

function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentHeading = '(intro)';
  let currentLines: string[] = [];
  let sectionIdx = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n').trim(),
          priority: currentHeading === '(intro)' ? 4 : scorePriority(currentHeading),
          originalIndex: sectionIdx++,
        });
      }
      currentHeading = headingMatch[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n').trim(),
      priority: currentHeading === '(intro)' ? 4 : scorePriority(currentHeading),
      originalIndex: sectionIdx,
    });
  }

  return sections;
}

/**
 * Truncate text at the last sentence boundary before maxChars.
 * Falls back to word boundary, then hard cut.
 */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);

  // Find last sentence-ending punctuation
  const sentenceEnd = slice.lastIndexOf('. ');
  if (sentenceEnd > maxChars * 0.4) {
    return slice.slice(0, sentenceEnd + 1);
  }

  // Fall back to word boundary
  const wordEnd = slice.lastIndexOf(' ');
  if (wordEnd > maxChars * 0.4) {
    return slice.slice(0, wordEnd);
  }

  return slice;
}

/**
 * Smart truncation: preserves intro + key sections, truncates at sentence boundaries.
 *
 * @param markdown Full page markdown
 * @param maxChars Target character limit (default: 2000)
 * @returns Truncated markdown preserving structure and coherence
 */
export function smartTruncate(markdown: string, maxChars = 2000): string {
  if (markdown.length <= maxChars) return markdown;

  const sections = splitIntoSections(markdown);
  if (sections.length === 0) {
    return truncateAtSentence(markdown, maxChars);
  }

  // Sort by priority (highest first), stable sort preserves order within same priority
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);

  const included: Section[] = [];
  let totalChars = 0;
  const budget = maxChars - 20; // reserve space for [truncated] marker

  for (const section of sorted) {
    const sectionText = section.heading !== '(intro)'
      ? `## ${section.heading}\n${section.content}`
      : section.content;

    if (totalChars + sectionText.length <= budget) {
      included.push({ ...section, content: sectionText });
      totalChars += sectionText.length + 1; // +1 for newline
    } else {
      // Fit what we can from this section
      const remaining = budget - totalChars;
      if (remaining > 100) {
        const truncated = truncateAtSentence(sectionText, remaining);
        included.push({ ...section, content: truncated });
        totalChars += truncated.length;
      }
      break;
    }
  }

  // Re-sort included sections to restore original document order
  included.sort((a, b) => a.originalIndex - b.originalIndex);

  return included.map((s) => s.content).join('\n\n') + '\n[truncated]';
}
