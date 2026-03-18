/**
 * GEO Analysis types — compatible subset of innotekseoai's GeoPageAnalysis
 */

import { z } from 'zod';

export const GeoPageAnalysisSchema = z.object({
  json_ld: z.string(),
  mirror_markdown: z.string().optional(),
  llms_txt_entry: z.string(),
  entity_clarity_score: z.number().min(1).max(10),
  fact_density_count: z.number().min(0),
  word_count: z.number().min(0),
  content_quality_score: z.number().min(1).max(10),
  semantic_structure_score: z.number().min(1).max(10),
  entity_richness_score: z.number().min(1).max(10),
  citation_readiness_score: z.number().min(1).max(10),
  technical_seo_score: z.number().min(1).max(10),
  user_intent_alignment_score: z.number().min(1).max(10),
  trust_signals_score: z.number().min(1).max(10),
  authority_score: z.number().min(1).max(10),
  geo_recommendations: z.array(z.string()),
  confidence_score: z.number().min(0).max(1).optional(),
  score_explanations: z.record(z.string(), z.string()).optional(),
});

export type GeoPageAnalysis = z.infer<typeof GeoPageAnalysisSchema>;

export interface SiteMetrics {
  avg_entity_clarity: number;
  total_facts: number;
  avg_words_per_fact: number;
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  critical_issues: string[];
  priority_recommendations: string[];
  schema_completeness_score: number;
  avg_content_quality: number;
  avg_semantic_structure: number;
  avg_entity_richness: number;
  avg_citation_readiness: number;
  avg_technical_seo: number;
  avg_user_intent: number;
  avg_trust_signals: number;
  avg_authority: number;
  premium_score: number;
}

export interface GeoAnalysisResult {
  primary_json_ld: string;
  llms_txt: string;
  pages: Array<{
    page_url: string;
    result: GeoPageAnalysis;
  }>;
  site_metrics: SiteMetrics;
}
