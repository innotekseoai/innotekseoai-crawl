/**
 * Drizzle ORM schema — SQLite tables for crawl data
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const crawls = sqliteTable('crawls', {
  id: text('id').primaryKey(),
  baseUrl: text('base_url').notNull(),
  status: text('status', {
    enum: ['pending', 'crawling', 'analyzing', 'completed', 'failed'],
  }).notNull().default('pending'),
  crawlerType: text('crawler_type', {
    enum: ['native', 'browser'],
  }).notNull().default('native'),
  pagesCrawled: integer('pages_crawled').notNull().default(0),
  pageLimit: integer('page_limit').notNull().default(50),
  maxDepth: integer('max_depth'),
  errorMessage: text('error_message'),
  // Site-level analysis results
  primaryJsonLd: text('primary_json_ld'),
  llmsTxt: text('llms_txt'),
  overallGrade: text('overall_grade', { enum: ['A', 'B', 'C', 'D', 'F'] }),
  premiumScore: integer('premium_score'),
  siteMetrics: text('site_metrics'), // JSON blob — aggregate analysis results only
  config: text('config'), // JSON blob — startup config (analyze, modelPath, maxDepth)
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const crawlPages = sqliteTable('crawl_pages', {
  id: text('id').primaryKey(),
  crawlId: text('crawl_id').notNull().references(() => crawls.id),
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  canonicalUrl: text('canonical_url'),
  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImage: text('og_image'),
  robotsMeta: text('robots_meta'),
  httpStatus: integer('http_status'),
  redirectChain: text('redirect_chain'), // JSON array
  markdownPath: text('markdown_path'), // path in data/mirrors/
  charCount: integer('char_count'),
  status: text('status', {
    enum: ['pending', 'crawled', 'analyzed', 'failed'],
  }).notNull().default('crawled'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const pageAnalyses = sqliteTable('page_analyses', {
  id: text('id').primaryKey(),
  crawlId: text('crawl_id').notNull().references(() => crawls.id),
  crawlPageId: text('crawl_page_id').notNull().references(() => crawlPages.id),
  url: text('url').notNull(),
  jsonLd: text('json_ld'),
  mirrorMarkdown: text('mirror_markdown'),
  llmsTxtEntry: text('llms_txt_entry'),
  entityClarityScore: real('entity_clarity_score'),
  factDensityCount: integer('fact_density_count'),
  wordCount: integer('word_count'),
  contentQualityScore: real('content_quality_score'),
  semanticStructureScore: real('semantic_structure_score'),
  entityRichnessScore: real('entity_richness_score'),
  citationReadinessScore: real('citation_readiness_score'),
  technicalSeoScore: real('technical_seo_score'),
  userIntentAlignmentScore: real('user_intent_alignment_score'),
  trustSignalsScore: real('trust_signals_score'),
  authorityScore: real('authority_score'),
  confidenceScore: real('confidence_score'),
  geoRecommendations: text('geo_recommendations'), // JSON array
  scoreExplanations: text('score_explanations'), // JSON — reasons for low scores
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('pending'),
  progress: integer('progress').default(0),
  message: text('message'),
  error: text('error'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  secret: text('secret'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  baseUrl: text('base_url').notNull(),
  config: text('config'), // JSON — same format as crawls.config
  frequency: text('frequency').notNull().default('weekly'), // daily, weekly, monthly, or cron
  nextRunAt: text('next_run_at').notNull(),
  lastRunAt: text('last_run_at'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
