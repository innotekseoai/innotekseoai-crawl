#!/usr/bin/env tsx
/**
 * CLI crawl script
 *
 * Usage:
 *   npx tsx scripts/crawl.ts <url> [--limit N] [--model path/to/model.gguf] [--no-analyze]
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { crawlNative } from '../src/lib/crawler/native-client.js';
import { savePage } from '../src/lib/storage/markdown-store.js';
import { getDb, saveDb } from '../src/lib/db/client.js';
import { crawls, crawlPages, pageAnalyses } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Parse args
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));

if (!url) {
  console.error('Usage: npx tsx scripts/crawl.ts <url> [--limit N] [--model path] [--no-analyze]');
  process.exit(1);
}

const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 50;

const modelIdx = args.indexOf('--model');
const modelPath = modelIdx >= 0 ? args[modelIdx + 1] : null;

const noAnalyze = args.includes('--no-analyze');

async function main() {
  const db = await getDb();
  const crawlId = randomUUID();
  const now = new Date().toISOString();

  console.log(`\n=== InnotekSEO Crawler ===`);
  console.log(`URL: ${url}`);
  console.log(`Limit: ${limit} pages`);
  console.log(`Crawl ID: ${crawlId}`);
  if (modelPath) console.log(`Model: ${modelPath}`);
  console.log('');

  // Insert crawl record
  await db.insert(crawls).values({
    id: crawlId,
    baseUrl: url!,
    status: 'crawling',
    crawlerType: 'native',
    pageLimit: limit,
    createdAt: now,
    updatedAt: now,
  });

  // Run crawler
  const result = await crawlNative(url!, {
    limit,
    onPage: async (page, idx) => {
      const pageId = randomUUID();
      const markdownPath = savePage(crawlId, idx, page.markdown);

      await db.insert(crawlPages).values({
        id: pageId,
        crawlId,
        url: page.url,
        title: page.metadata?.title ?? null,
        description: page.metadata?.description ?? null,
        markdownPath,
        charCount: page.markdown.length,
        createdAt: new Date().toISOString(),
      });
    },
  });

  // Update crawl status
  await db.update(crawls)
    .set({
      status: result.success ? 'completed' : 'failed',
      pagesCrawled: result.pages.length,
      errorMessage: result.error ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(crawls.id, crawlId));

  saveDb();

  console.log(`\n--- Crawl Results ---`);
  console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Pages: ${result.pages.length}`);
  if (result.tier2FallbackCount) {
    console.log(`Tier 2 fallbacks: ${result.tier2FallbackCount}`);
  }
  if (result.error) console.log(`Error: ${result.error}`);

  // AI Analysis (if model specified and not skipped)
  if (!noAnalyze && modelPath) {
    if (!existsSync(modelPath)) {
      console.error(`\nModel not found: ${modelPath}`);
      console.log('Skipping analysis. Place a .gguf model in data/models/');
    } else {
      console.log(`\n--- Running GEO Analysis ---`);

      await db.update(crawls)
        .set({ status: 'analyzing', updatedAt: new Date().toISOString() })
        .where(eq(crawls.id, crawlId));

      const { modelManager } = await import('../src/lib/ai/model-manager.js');
      const { analyzePageForGeo, stopServer } = await import('../src/lib/ai/analyzer.js');
      const { isServerBinaryAvailable, ensureServerModel } = await import('../src/lib/ai/server-inference.js');
      const { aggregateResults } = await import('../src/lib/analysis/engine.js');

      try {
        // Try GPU-accelerated server first, fall back to subprocess/in-process
        let useServer = false;
        if (isServerBinaryAvailable()) {
          try {
            await ensureServerModel(modelPath, (msg) => console.log(`[gpu] ${msg}`));
            useServer = true;
          } catch (err) {
            console.log(`[analysis] GPU server unavailable, using subprocess: ${err instanceof Error ? err.message : err}`);
          }
        }

        if (!useServer) {
          await modelManager.load(modelPath);
        }

        const analysisResults: Array<{
          page_url: string;
          result: import('../src/types/analysis.js').GeoPageAnalysis;
        }> = [];

        // Get saved pages from DB
        const savedPages = await db.select().from(crawlPages).where(eq(crawlPages.crawlId, crawlId));

        for (let i = 0; i < savedPages.length; i++) {
          const page = savedPages[i];
          const pageMarkdown = result.pages.find((p) => p.url === page.url)?.markdown;
          if (!pageMarkdown?.trim()) continue;

          console.log(`[analysis] Analyzing page ${i + 1}/${savedPages.length}: ${page.url}`);

          try {
            const analysis = await analyzePageForGeo({
              url: page.url,
              markdown: pageMarkdown,
              baseUrl: url!,
              modelPath,
            });

            analysisResults.push({ page_url: page.url, result: analysis });

            await db.insert(pageAnalyses).values({
              id: randomUUID(),
              crawlId,
              crawlPageId: page.id,
              url: page.url,
              jsonLd: analysis.json_ld,
              mirrorMarkdown: analysis.mirror_markdown ?? null,
              llmsTxtEntry: analysis.llms_txt_entry,
              entityClarityScore: analysis.entity_clarity_score,
              factDensityCount: analysis.fact_density_count,
              wordCount: analysis.word_count,
              contentQualityScore: analysis.content_quality_score,
              semanticStructureScore: analysis.semantic_structure_score,
              entityRichnessScore: analysis.entity_richness_score,
              citationReadinessScore: analysis.citation_readiness_score,
              technicalSeoScore: analysis.technical_seo_score,
              userIntentAlignmentScore: analysis.user_intent_alignment_score,
              trustSignalsScore: analysis.trust_signals_score,
              authorityScore: analysis.authority_score,
              geoRecommendations: JSON.stringify(analysis.geo_recommendations),
              createdAt: new Date().toISOString(),
            });

            console.log(
              `[analysis] Entity clarity: ${analysis.entity_clarity_score}/10, ` +
              `Facts: ${analysis.fact_density_count}, Words: ${analysis.word_count}`
            );
          } catch (err) {
            console.error(`[analysis] Failed for ${page.url}: ${err}`);
          }
        }

        if (useServer) {
          stopServer();
        } else {
          await modelManager.unload();
        }

        if (analysisResults.length > 0) {
          const aggregate = aggregateResults(url!, analysisResults);

          await db.update(crawls)
            .set({
              status: 'completed',
              primaryJsonLd: aggregate.primary_json_ld,
              llmsTxt: aggregate.llms_txt,
              overallGrade: aggregate.site_metrics.overall_grade,
              premiumScore: aggregate.site_metrics.premium_score,
              siteMetrics: JSON.stringify(aggregate.site_metrics),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(crawls.id, crawlId));

          saveDb();

          console.log(`\n--- Analysis Results ---`);
          console.log(`Overall Grade: ${aggregate.site_metrics.overall_grade}`);
          console.log(`Premium Score: ${aggregate.site_metrics.premium_score}/100`);
          console.log(`Entity Clarity: ${aggregate.site_metrics.avg_entity_clarity}/10`);
          console.log(`Total Facts: ${aggregate.site_metrics.total_facts}`);
          console.log(`Schema Completeness: ${aggregate.site_metrics.schema_completeness_score}%`);
          console.log(`\nPriority Recommendations:`);
          for (const rec of aggregate.site_metrics.priority_recommendations) {
            console.log(`  - ${rec}`);
          }
          console.log(`\nllms.txt preview:\n${aggregate.llms_txt.slice(0, 500)}`);
        }
      } catch (err) {
        console.error(`\nAnalysis failed: ${err}`);
        await db.update(crawls)
          .set({
            status: 'failed',
            errorMessage: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(crawls.id, crawlId));
        saveDb();
      }
    }
  } else if (!noAnalyze && !modelPath) {
    console.log('\nNo model specified. Skipping analysis.');
    console.log('To run analysis: --model data/models/your-model.gguf');
  }

  saveDb();
  console.log(`\nData stored in:`);
  console.log(`  DB: ./data/crawl.db (crawl ID: ${crawlId})`);
  console.log(`  Markdown: ./data/mirrors/${crawlId}/`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  saveDb();
  process.exit(1);
});
