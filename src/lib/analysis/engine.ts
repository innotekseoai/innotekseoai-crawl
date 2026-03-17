/**
 * GEO Analysis Engine — grading and aggregation
 * Ported from innotekseoai's lib/analysis/engine.ts
 */

import type { GeoPageAnalysis, GeoAnalysisResult, SiteMetrics } from '../../types/analysis.js';

export function round(value: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

export function gradeFromMetrics(
  avgEntityClarity: number,
  wordsPerFact: number,
  schemaScore: number
): 'A' | 'B' | 'C' | 'D' | 'F' {
  const factGrade =
    wordsPerFact <= 150 ? 'A'
    : wordsPerFact <= 250 ? 'B'
    : wordsPerFact <= 400 ? 'C'
    : wordsPerFact <= 600 ? 'D'
    : 'F';

  if (avgEntityClarity >= 9 && factGrade === 'A' && schemaScore >= 85) return 'A';
  if (avgEntityClarity >= 7 && ['A', 'B'].includes(factGrade) && schemaScore >= 70) return 'B';
  if (avgEntityClarity >= 5 && ['A', 'B', 'C'].includes(factGrade) && schemaScore >= 50) return 'C';
  if (avgEntityClarity >= 3 && ['A', 'B', 'C', 'D'].includes(factGrade) && schemaScore >= 30) return 'D';
  return 'F';
}

export function computeSchemaCompleteness(primaryJsonLd: string): number {
  try {
    const parsed = JSON.parse(primaryJsonLd);

    const graphNodes = Array.isArray(parsed?.['@graph'])
      ? (parsed['@graph'] as Record<string, unknown>[])
      : null;
    const node: Record<string, unknown> = graphNodes
      ? (graphNodes.find((n) => {
          const t = n?.['@type'];
          return (
            t === 'Organization' || t === 'LocalBusiness' ||
            (Array.isArray(t) && (t.includes('Organization') || t.includes('LocalBusiness')))
          );
        }) ?? graphNodes[0])
      : (parsed as Record<string, unknown>);

    const publisherNode = node?.publisher as Record<string, unknown> | undefined;
    const contactPointNode = node?.contactPoint as Record<string, unknown> | undefined;
    const hasContact = Boolean(
      node?.address || node?.telephone || node?.email ||
      publisherNode?.telephone || publisherNode?.email || publisherNode?.address ||
      contactPointNode?.telephone || contactPointNode?.email
    );

    const checks = [
      Boolean(parsed?.['@context']),
      Boolean(node?.['@type']),
      Boolean(node?.name),
      Boolean(node?.url || node?.sameAs),
      hasContact,
    ];
    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  } catch {
    return 0;
  }
}

export function buildLlmsTxt(baseUrl: string, entries: string[]): string {
  const url = new URL(baseUrl);
  const title = `${url.hostname} – GEO Content Directory`;
  const cleanEntries = entries.filter(Boolean).map((e) => e.trim());

  return `# ${title}

> Machine-readable factual directory for AI assistants and answer engines.

${cleanEntries.join('\n')}
`;
}

export function aggregateResults(
  baseUrl: string,
  pageResults: Array<{ page_url: string; result: GeoPageAnalysis }>
): GeoAnalysisResult {
  if (pageResults.length === 0) {
    throw new Error('No analyzable pages');
  }

  const n = pageResults.length;
  const avg = (fn: (r: GeoPageAnalysis) => number) =>
    round(pageResults.reduce((s, p) => s + fn(p.result), 0) / n, 2);

  const totalFacts = pageResults.reduce((s, p) => s + p.result.fact_density_count, 0);
  const totalWords = pageResults.reduce((s, p) => s + p.result.word_count, 0);
  const avgEntityClarity = avg((r) => r.entity_clarity_score);
  const avgWordsPerFact = totalFacts > 0 ? round(totalWords / totalFacts, 2) : totalWords;

  const homepagePage = pageResults.find((p) => {
    try {
      const u = new URL(p.page_url);
      return u.pathname === '/' || u.href.replace(/\/$/, '') === baseUrl.replace(/\/$/, '');
    } catch { return false; }
  });
  const primaryJsonLd = (homepagePage ?? pageResults[0]).result.json_ld;
  const schemaCompletenessScore = computeSchemaCompleteness(primaryJsonLd);
  const overallGrade = gradeFromMetrics(avgEntityClarity, avgWordsPerFact, schemaCompletenessScore);

  const allRecommendations = pageResults.flatMap((p) => p.result.geo_recommendations);
  const uniqueRecommendations = [...new Set(allRecommendations)];
  const priorityRecommendations = uniqueRecommendations.slice(0, 5);

  const criticalIssues = uniqueRecommendations
    .filter((r) => /missing|required|critical|must|invalid|add|include|consider|prioritize|ensure/i.test(r))
    .slice(0, 5);

  const premiumScore = Math.round(
    (avg((r) => r.content_quality_score) +
      avg((r) => r.semantic_structure_score) +
      avg((r) => r.entity_richness_score) +
      avg((r) => r.citation_readiness_score) +
      avg((r) => r.technical_seo_score) +
      avg((r) => r.user_intent_alignment_score) +
      avg((r) => r.trust_signals_score) +
      avg((r) => r.authority_score) +
      avgEntityClarity) *
      1.11
  );

  const siteMetrics: SiteMetrics = {
    avg_entity_clarity: avgEntityClarity,
    total_facts: totalFacts,
    avg_words_per_fact: avgWordsPerFact,
    overall_grade: overallGrade,
    critical_issues: criticalIssues.length >= 2 ? criticalIssues : uniqueRecommendations.slice(0, 5),
    priority_recommendations: priorityRecommendations,
    schema_completeness_score: schemaCompletenessScore,
    avg_content_quality: avg((r) => r.content_quality_score),
    avg_semantic_structure: avg((r) => r.semantic_structure_score),
    avg_entity_richness: avg((r) => r.entity_richness_score),
    avg_citation_readiness: avg((r) => r.citation_readiness_score),
    avg_technical_seo: avg((r) => r.technical_seo_score),
    avg_user_intent: avg((r) => r.user_intent_alignment_score),
    avg_trust_signals: avg((r) => r.trust_signals_score),
    avg_authority: avg((r) => r.authority_score),
    premium_score: premiumScore,
  };

  return {
    primary_json_ld: primaryJsonLd,
    llms_txt: buildLlmsTxt(baseUrl, pageResults.map((p) => p.result.llms_txt_entry)),
    pages: pageResults,
    site_metrics: siteMetrics,
  };
}
