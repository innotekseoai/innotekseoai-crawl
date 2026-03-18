/**
 * Idempotent crawl + analysis pipeline
 *
 * Each page is an independent unit of work with status tracking:
 *   pending → crawled → analyzed (or failed)
 *
 * Resume picks up from the last successful state.
 * DB is saved after every page to survive crashes.
 * Emits detailed log events for the terminal console.
 */

import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { eq } from 'drizzle-orm';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls, crawlPages, pageAnalyses } from '@/lib/db/schema';
import { crawlNative } from '@/lib/crawler/native-client';
import { savePage, readPage } from '@/lib/storage/markdown-store';
import { withRetry } from '@/lib/crawler/retry';
import { dispatchWebhook } from '@/lib/webhooks/dispatcher';
import { isInnotekseoaiConfigured, pushToInnotekseoai } from '@/lib/integrations/innotekseoai';
import { taskManager } from './task-manager';

interface PipelineOptions {
  crawlId: string;
  url: string;
  limit: number;
  crawlerType: 'native' | 'browser';
  analyze: boolean;
  modelPath?: string;
  maxDepth?: number;
  signal?: AbortSignal;
}

let _logCounter = 0;

function emitLog(
  crawlId: string,
  level: 'info' | 'success' | 'warn' | 'error' | 'detail',
  message: string
) {
  taskManager.emit('task:log', {
    taskId: crawlId,
    id: `log-${++_logCounter}`,
    level,
    message,
  });
}

export async function runPipeline(opts: PipelineOptions) {
  const { crawlId, url, limit, analyze, modelPath, maxDepth } = opts;

  taskManager.create(crawlId);
  const abortSignal = opts.signal ?? taskManager.getSignal(crawlId);
  taskManager.run(crawlId, async (update) => {
    const db = await getDb();
    const hostname = new URL(url).hostname;

    // --- Phase 1: Crawl ---
    const existingPages = await db.select().from(crawlPages)
      .where(eq(crawlPages.crawlId, crawlId));
    const alreadyCrawledUrls = new Set(existingPages.map((p) => p.url));

    if (existingPages.length > 0) {
      emitLog(crawlId, 'info', `Resuming crawl — ${existingPages.length} pages already in database`);
      update(5, `Resuming — ${existingPages.length} pages already crawled`);

      for (const page of existingPages) {
        taskManager.emit('task:page', {
          taskId: crawlId,
          url: page.url,
          title: page.title,
          charCount: page.charCount ?? 0,
          index: existingPages.indexOf(page),
        });
      }
    } else {
      emitLog(crawlId, 'info', `Starting crawl for ${hostname}`);
      update(5, 'Starting crawl...');
      dispatchWebhook('crawl.started', crawlId, { url, limit });
    }

    const crawl = await db.select().from(crawls).where(eq(crawls.id, crawlId)).then((r) => r[0]);
    const needsCrawl = crawl?.status === 'crawling' || existingPages.length === 0;

    if (needsCrawl) {
      await db.update(crawls)
        .set({ status: 'crawling', updatedAt: new Date().toISOString() })
        .where(eq(crawls.id, crawlId));
      saveDb();

      let pageIndex = existingPages.length;

      const result = await crawlNative(url, {
        limit,
        maxDepth,
        signal: abortSignal,
        onProgress: (event) => {
          const levelMap: Record<string, 'info' | 'success' | 'warn' | 'detail'> = {
            robots: 'detail',
            sitemap: 'info',
            queue: 'info',
            blocked: 'warn',
            error: 'warn',
          };
          emitLog(crawlId, levelMap[event.type] ?? 'detail', event.message);
        },
        onPage: async (page, _idx) => {
          if (alreadyCrawledUrls.has(page.url)) return;

          const pageId = randomUUID();
          const markdownPath = savePage(crawlId, pageIndex, page.markdown);

          await db.insert(crawlPages).values({
            id: pageId,
            crawlId,
            url: page.url,
            title: page.metadata?.title ?? null,
            description: page.metadata?.description ?? null,
            canonicalUrl: page.metadata?.canonicalUrl ?? null,
            ogTitle: page.metadata?.ogTitle ?? null,
            ogDescription: page.metadata?.ogDescription ?? null,
            ogImage: page.metadata?.ogImage ?? null,
            robotsMeta: page.metadata?.robotsMeta ?? null,
            httpStatus: page.metadata?.httpStatus ?? null,
            redirectChain: page.metadata?.redirectChain ? JSON.stringify(page.metadata.redirectChain) : null,
            markdownPath,
            charCount: page.markdown.length,
            status: 'crawled',
            createdAt: new Date().toISOString(),
          });
          saveDb();

          taskManager.emit('task:page', {
            taskId: crawlId,
            url: page.url,
            title: page.metadata?.title,
            charCount: page.markdown.length,
            index: pageIndex,
          });

          pageIndex++;

          const progress = Math.min(90, 5 + Math.round((pageIndex / limit) * 85));
          update(progress, `Crawled: ${page.url}`);
        },
      });

      const totalPages = await db.select().from(crawlPages)
        .where(eq(crawlPages.crawlId, crawlId));

      if (result.success) {
        emitLog(crawlId, 'success', `Crawl complete — ${totalPages.length} pages fetched from ${result.totalDiscovered ?? 0} discovered URLs`);
        if ((result.robotsBlocked ?? 0) > 0) {
          emitLog(crawlId, 'detail', `${result.robotsBlocked} URLs blocked by robots.txt`);
        }
        if ((result.tier2FallbackCount ?? 0) > 0) {
          emitLog(crawlId, 'detail', `${result.tier2FallbackCount} pages used Playwright fallback (thin content)`);
        }
        if (totalPages.length < limit) {
          emitLog(crawlId, 'info', `URL queue exhausted — site has ${totalPages.length} crawlable pages (limit was ${limit})`);
        }
      } else {
        emitLog(crawlId, 'error', `Crawl failed: ${result.error ?? 'Unknown error'}`);
      }

      await db.update(crawls)
        .set({
          status: result.success ? (analyze ? 'analyzing' : 'completed') : 'failed',
          pagesCrawled: totalPages.length,
          errorMessage: result.error ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(crawls.id, crawlId));
      saveDb();

      if (!result.success && totalPages.length === 0) {
        return { crawlId, pages: 0 };
      }
    }

    // --- Phase 2: Analysis ---
    if (!analyze || !modelPath) {
      emitLog(crawlId, 'info', 'Analysis skipped — no model selected');
      // Re-query to get fresh count (existingPages is stale after crawl)
      const freshPages = await db.select().from(crawlPages)
        .where(eq(crawlPages.crawlId, crawlId));
      return { crawlId, pages: freshPages.length };
    }

    await db.update(crawls)
      .set({ status: 'analyzing', updatedAt: new Date().toISOString() })
      .where(eq(crawls.id, crawlId));
    saveDb();

    emitLog(crawlId, 'info', 'Starting GEO analysis pipeline...');
    emitLog(crawlId, 'detail', `Model: ${modelPath.split('/').pop()}`);
    update(92, 'Loading AI model...');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let modelManager: any, analyzePageForGeo: any, aggregateResults: any, useSubprocess: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let startServer: any, stopServer: any, isServerHealthy: any, isServerBinaryAvailable: any, ensureServerModel: any, getServerModelName: any;

    try {
      ({ modelManager } = await import('@/lib/ai/model-manager'));
      ({ analyzePageForGeo, useSubprocess, startServer, stopServer, isServerHealthy } = await import('@/lib/ai/analyzer'));
      ({ isServerBinaryAvailable, ensureServerModel, getServerModelName } = await import('@/lib/ai/server-inference'));
      ({ aggregateResults } = await import('@/lib/analysis/engine'));
    } catch (importErr) {
      const msg = importErr instanceof Error ? importErr.message : String(importErr);
      emitLog(crawlId, 'error', `Failed to load analysis modules: ${msg}`);
      await db.update(crawls)
        .set({ status: 'failed', errorMessage: msg, updatedAt: new Date().toISOString() })
        .where(eq(crawls.id, crawlId));
      saveDb();
      return { crawlId, pages: 0 };
    }

    // Try GPU server first, then subprocess, then in-process
    let usingServer = false;
    const usingSubprocess = useSubprocess();

    let serverModelName: string | null = null;
    if (isServerBinaryAvailable() && modelPath) {
      try {
        // ensureServerModel will start or restart the server with the correct model
        await ensureServerModel(modelPath, (msg: string) => {
          emitLog(crawlId, 'detail', `[gpu] ${msg}`);
        });
        serverModelName = await getServerModelName();
        emitLog(crawlId, 'success', `GPU server ready — ${serverModelName}`);
        usingServer = true;
      } catch (serverErr) {
        const msg = serverErr instanceof Error ? serverErr.message : String(serverErr);
        emitLog(crawlId, 'warn', `GPU server failed: ${msg} — falling back to CPU`);
      }
    }

    if (!usingServer) {
      if (usingSubprocess) {
        emitLog(crawlId, 'success', 'Using llama-completion subprocess (CPU)');
      } else {
        emitLog(crawlId, 'detail', 'Using in-process node-llama-cpp');
        try {
          await modelManager.load(modelPath, (msg: string) => {
            emitLog(crawlId, 'detail', msg);
          });
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          emitLog(crawlId, 'error', `Failed to load model: ${msg}`);
          await db.update(crawls)
            .set({ status: 'failed', errorMessage: msg, updatedAt: new Date().toISOString() })
            .where(eq(crawls.id, crawlId));
          saveDb();
          return { crawlId, pages: 0 };
        }
      }
    }
    emitLog(crawlId, 'success', 'Ready for inference');

    const allPages = await db.select().from(crawlPages)
      .where(eq(crawlPages.crawlId, crawlId));
    const pendingAnalysis = allPages.filter((p) => p.status === 'crawled');
    const alreadyAnalyzed = allPages.filter((p) => p.status === 'analyzed');
    const failedPages = allPages.filter((p) => p.status === 'failed');

    if (alreadyAnalyzed.length > 0) {
      emitLog(crawlId, 'info', `${alreadyAnalyzed.length} pages already analyzed — skipping`);
    }
    if (failedPages.length > 0) {
      emitLog(crawlId, 'warn', `${failedPages.length} pages previously failed — will retry`);
      // Re-queue failed pages for retry
      for (const p of failedPages) {
        await db.update(crawlPages)
          .set({ status: 'crawled', errorMessage: null })
          .where(eq(crawlPages.id, p.id));
      }
      pendingAnalysis.push(...failedPages);
    }

    // Concurrent analysis when using GPU server, sequential for CPU
    const concurrencyLimit = usingServer ? 3 : 1;
    emitLog(crawlId, 'info', `Analyzing ${pendingAnalysis.length} pages with local AI (concurrency: ${concurrencyLimit})...`);

    // Shared counters — safe in Node.js single-threaded model between sync points,
    // but we assign pageNum at the synchronous point before the first await to avoid
    // stale reads when concurrent tasks interleave.
    const counters = { analyzed: alreadyAnalyzed.length, failed: 0 };
    const startTime = Date.now();

    // Extract per-page analysis into reusable function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function analyzeSinglePage(page: any) {
      if (abortSignal?.aborted) return; // Check cancellation
      const idxMatch = page.markdownPath?.match(/(\d+)\.md$/);
      const pageIndex = idxMatch ? parseInt(idxMatch[1], 10) : 0;
      const pageMarkdown = readPage(crawlId, pageIndex);

      const pagePath = (() => {
        try { return new URL(page.url).pathname; } catch { return page.url; }
      })();

      if (!pageMarkdown?.trim()) {
        emitLog(crawlId, 'warn', `Skipping ${page.url} — empty content`);
        await db.update(crawlPages)
          .set({ status: 'failed', errorMessage: 'Empty markdown' })
          .where(eq(crawlPages.id, page.id));
        saveDb();
        counters.failed++;
        return;
      }

      // Assign page number synchronously before any await to avoid stale reads
      const pageNum = ++counters.analyzed;
      const pageStart = Date.now();
      emitLog(crawlId, 'detail', `[${pageNum}/${allPages.length}] Analyzing ${pagePath} (${(pageMarkdown.length / 1000).toFixed(1)}k chars)...`);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analysis: any = await withRetry(
          () => analyzePageForGeo({
            url: page.url,
            markdown: pageMarkdown,
            baseUrl: url,
            modelPath,
            onProgress: (msg: string) => {
              emitLog(crawlId, 'detail', `  ${pagePath}: ${msg}`);
            },
          }),
          {
            maxRetries: 2,
            baseDelay: 1000,
            onRetry: (attempt, err) => {
              emitLog(crawlId, 'warn', `Retry ${attempt} for ${pagePath}: ${err.message}`);
            },
          }
        );

        // Check cancellation after inference (before DB writes)
        if (abortSignal?.aborted) return;

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
          confidenceScore: analysis.confidence_score ?? null,
          scoreExplanations: analysis.score_explanations ? JSON.stringify(analysis.score_explanations) : null,
          createdAt: new Date().toISOString(),
        });

        await db.update(crawlPages)
          .set({ status: 'analyzed' })
          .where(eq(crawlPages.id, page.id));
        saveDb();

        // pageNum already incremented counters.analyzed synchronously above

        const avgScore = (
          (analysis.content_quality_score + analysis.semantic_structure_score +
           analysis.entity_richness_score + analysis.citation_readiness_score +
           analysis.technical_seo_score + analysis.trust_signals_score +
           analysis.authority_score + analysis.entity_clarity_score) / 8
        ).toFixed(1);
        const conf = analysis.confidence_score !== undefined ? ` · conf: ${(analysis.confidence_score * 100).toFixed(0)}%` : '';
        const pageDuration = ((Date.now() - pageStart) / 1000).toFixed(1);
        emitLog(crawlId, 'success',
          `${pagePath} — clarity: ${analysis.entity_clarity_score}/10 · facts: ${analysis.fact_density_count} · avg: ${avgScore}/10${conf} · ${pageDuration}s`
        );
        if (analysis.geo_recommendations.length > 0) {
          emitLog(crawlId, 'detail', `  └ ${analysis.geo_recommendations[0]}`);
        }

        taskManager.emit('task:analysis', {
          taskId: crawlId,
          url: page.url,
          entityClarityScore: analysis.entity_clarity_score,
        });
        dispatchWebhook('page.analyzed', crawlId, { url: page.url, avgScore: parseFloat(avgScore) });

        update(
          92 + Math.round((counters.analyzed / allPages.length) * 7),
          `Analyzing: ${page.url}`
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db.update(crawlPages)
          .set({ status: 'failed', errorMessage: errMsg })
          .where(eq(crawlPages.id, page.id));
        saveDb();
        counters.failed++;
        emitLog(crawlId, 'error', `${pagePath} failed after retries: ${errMsg}`);
      }
    }

    // Run with concurrency limiter
    const analysisLimiter = pLimit(concurrencyLimit);
    await Promise.all(
      pendingAnalysis.map((page) =>
        analysisLimiter(() => analyzeSinglePage(page))
      )
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (usingServer) {
      // Keep server running for future requests (don't stop it)
      emitLog(crawlId, 'detail', 'llama-server kept running for future requests');
    } else if (!usingSubprocess) {
      emitLog(crawlId, 'detail', 'Unloading model...');
      await modelManager.unload();
    }

    // Aggregate all successful analyses
    const allAnalyses = await db.select().from(pageAnalyses)
      .where(eq(pageAnalyses.crawlId, crawlId));

    if (allAnalyses.length > 0) {
      emitLog(crawlId, 'info', `Aggregating results from ${allAnalyses.length} analyses...`);

      const analysisResults = allAnalyses.map((a) => ({
        page_url: a.url,
        result: {
          json_ld: a.jsonLd ?? '{}',
          llms_txt_entry: a.llmsTxtEntry ?? '',
          entity_clarity_score: a.entityClarityScore ?? 5,
          fact_density_count: a.factDensityCount ?? 0,
          word_count: a.wordCount ?? 0,
          content_quality_score: a.contentQualityScore ?? 5,
          semantic_structure_score: a.semanticStructureScore ?? 5,
          entity_richness_score: a.entityRichnessScore ?? 5,
          citation_readiness_score: a.citationReadinessScore ?? 5,
          technical_seo_score: a.technicalSeoScore ?? 5,
          user_intent_alignment_score: a.userIntentAlignmentScore ?? 5,
          trust_signals_score: a.trustSignalsScore ?? 5,
          authority_score: a.authorityScore ?? 5,
          geo_recommendations: JSON.parse(a.geoRecommendations ?? '[]'),
        },
      }));

      const aggregate = aggregateResults(url, analysisResults);

      emitLog(crawlId, 'success',
        `Overall grade: ${aggregate.site_metrics.overall_grade} — Premium score: ${aggregate.site_metrics.premium_score}/100`
      );
      emitLog(crawlId, 'detail', `Generated JSON-LD schema (${aggregate.primary_json_ld.length} chars)`);
      emitLog(crawlId, 'detail', `Generated llms.txt (${aggregate.llms_txt.split('\n').length} lines)`);

      if (counters.failed > 0) {
        emitLog(crawlId, 'warn', `${counters.failed} page${counters.failed !== 1 ? 's' : ''} failed analysis — use Resume to retry`);
      }

      emitLog(crawlId, 'success', `Pipeline complete in ${elapsed}s — ${allAnalyses.length} pages analyzed`);
      dispatchWebhook('crawl.completed', crawlId, {
        grade: aggregate.site_metrics.overall_grade,
        premiumScore: aggregate.site_metrics.premium_score,
        pagesAnalyzed: allAnalyses.length,
      });

      // Optional: push results to innotekseoai
      if (isInnotekseoaiConfigured()) {
        emitLog(crawlId, 'info', 'Pushing results to innotekseoai...');
        const pushed = await pushToInnotekseoai(url, aggregate);
        emitLog(crawlId, pushed ? 'success' : 'warn',
          pushed ? 'Results pushed to innotekseoai' : 'Failed to push to innotekseoai'
        );
      }

      await db.update(crawls)
        .set({
          status: 'completed',
          primaryJsonLd: aggregate.primary_json_ld,
          llmsTxt: aggregate.llms_txt,
          overallGrade: aggregate.site_metrics.overall_grade,
          premiumScore: aggregate.site_metrics.premium_score,
          siteMetrics: JSON.stringify({
            ...aggregate.site_metrics,
            model_used: usingServer ? (serverModelName ?? 'llama-server (GPU)') : modelPath?.split('/').pop() ?? 'unknown',
            inference_backend: usingServer ? 'gpu-opencl' : (usingSubprocess ? 'cpu-subprocess' : 'cpu-in-process'),
          }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(crawls.id, crawlId));
    } else {
      emitLog(crawlId, 'warn', 'No pages were successfully analyzed');
      await db.update(crawls)
        .set({ status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(crawls.id, crawlId));
    }
    saveDb();

    return { crawlId, pages: allPages.length };
  }).catch((err) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : '';
    console.error(`[pipeline] FATAL for crawl ${opts.crawlId}:`, errMsg, errStack);
    emitLog(opts.crawlId, 'error', `Pipeline crashed: ${errMsg}`);
    dispatchWebhook('crawl.failed', opts.crawlId, { error: errMsg });
    getDb().then(async (db) => {
      await db.update(crawls)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(crawls.id, opts.crawlId));
      saveDb();
    }).catch(() => {});
  });
}
