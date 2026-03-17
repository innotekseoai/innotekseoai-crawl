/**
 * Recommendation dedup, categorization, and prioritization
 *
 * Processes raw recommendation strings from per-page analyses into
 * categorized, deduplicated, impact-sorted recommendations.
 */

export type ImpactLevel = 'high' | 'medium' | 'low';
export type Category = 'Content' | 'Technical' | 'Schema' | 'Trust';

export interface CategorizedRecommendation {
  text: string;
  impact: ImpactLevel;
  category: Category;
  frequency: number; // how many pages had this recommendation
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: Category }> = [
  { pattern: /schema|json-ld|structured data|markup|@type/i, category: 'Schema' },
  { pattern: /meta|title|heading|h[1-6]|alt\s*tag|canonical|sitemap|robots|url|redirect|speed|core web/i, category: 'Technical' },
  { pattern: /trust|credential|testimonial|review|certif|award|author|byline|cite|source|reference/i, category: 'Trust' },
  { pattern: /content|keyword|topic|entity|fact|clarity|readability|intent|quality|word/i, category: 'Content' },
];

const IMPACT_WEIGHT: Record<ImpactLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function detectCategory(text: string): Category {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'Content'; // default
}

function parseImpact(text: string): { impact: ImpactLevel; cleanText: string } {
  const match = text.match(/^\[?(high|medium|low)\]?\s*(.+)/i);
  if (match) {
    return {
      impact: match[1].toLowerCase() as ImpactLevel,
      cleanText: match[2].trim(),
    };
  }
  return { impact: 'medium', cleanText: text };
}

/**
 * Normalize recommendation text for dedup comparison.
 */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Process raw recommendations from all pages into categorized, prioritized list.
 */
export function processRecommendations(
  allRecs: string[]
): CategorizedRecommendation[] {
  const dedupMap = new Map<string, CategorizedRecommendation>();

  for (const raw of allRecs) {
    if (!raw?.trim()) continue;

    const { impact, cleanText } = parseImpact(raw);
    const category = detectCategory(cleanText);
    const key = normalizeForDedup(cleanText);

    const existing = dedupMap.get(key);
    if (existing) {
      existing.frequency++;
      // Upgrade impact if higher
      if (IMPACT_WEIGHT[impact] > IMPACT_WEIGHT[existing.impact]) {
        existing.impact = impact;
      }
    } else {
      dedupMap.set(key, {
        text: cleanText,
        impact,
        category,
        frequency: 1,
      });
    }
  }

  // Sort by impact × frequency (highest priority first)
  return [...dedupMap.values()].sort((a, b) => {
    const scoreA = IMPACT_WEIGHT[a.impact] * a.frequency;
    const scoreB = IMPACT_WEIGHT[b.impact] * b.frequency;
    return scoreB - scoreA;
  });
}

/**
 * Get top recommendations grouped by category.
 */
export function groupByCategory(
  recs: CategorizedRecommendation[]
): Record<Category, CategorizedRecommendation[]> {
  const groups: Record<Category, CategorizedRecommendation[]> = {
    Content: [],
    Technical: [],
    Schema: [],
    Trust: [],
  };

  for (const rec of recs) {
    groups[rec.category].push(rec);
  }

  return groups;
}
