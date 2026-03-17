import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb, saveDb } from '@/lib/db/client';
import { crawls, crawlPages, pageAnalyses } from '@/lib/db/schema';
import { taskManager } from '@/lib/queue/task-manager';
import { eq } from 'drizzle-orm';
import { readPage } from '@/lib/storage/markdown-store';

export async function POST(request: NextRequest) {
  try {
    const { crawlId, modelPath } = await request.json();

    if (!crawlId || !modelPath) {
      return NextResponse.json(
        { error: 'crawlId and modelPath are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const [crawl] = await db.select().from(crawls).where(eq(crawls.id, crawlId));
    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    await db.update(crawls)
      .set({ status: 'analyzing', updatedAt: new Date().toISOString() })
      .where(eq(crawls.id, crawlId));
    saveDb();

    const taskId = `analyze-${crawlId}`;
    taskManager.create(taskId);

    taskManager.run(taskId, async (update) => {
      update(5, 'Loading AI model...');

      const { modelManager } = await import('@/lib/ai/model-manager');
      const { analyzePageForGeo } = await import('@/lib/ai/analyzer');
      const { aggregateResults } = await import('@/lib/analysis/engine');

      await modelManager.load(modelPath);
      update(15, 'Model loaded, analyzing pages...');

      const savedPages = await db.select().from(crawlPages).where(eq(crawlPages.crawlId, crawlId));
      const analysisResults: Array<{ page_url: string; result: any }> = [];

      for (let i = 0; i < savedPages.length; i++) {
        const page = savedPages[i];

        // Read markdown from storage
        const pathParts = page.markdownPath?.split('/');
        const index = pathParts ? parseInt(pathParts[pathParts.length - 1].replace('.md', ''), 10) : i;
        const markdown = readPage(crawlId, index);
        if (!markdown?.trim()) continue;

        update(
          15 + Math.round((i / savedPages.length) * 75),
          `Analyzing page ${i + 1}/${savedPages.length}: ${page.url}`
        );

        try {
          const analysis = await analyzePageForGeo({
            url: page.url,
            markdown,
            baseUrl: crawl.baseUrl,
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
        } catch (err) {
          console.error(`Analysis failed for ${page.url}:`, err);
        }
      }

      await modelManager.unload();

      if (analysisResults.length > 0) {
        const aggregate = aggregateResults(crawl.baseUrl, analysisResults);
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
      } else {
        await db.update(crawls)
          .set({ status: 'completed', updatedAt: new Date().toISOString() })
          .where(eq(crawls.id, crawlId));
      }
      saveDb();

      return { analyzed: analysisResults.length };
    }).catch(() => {});

    return NextResponse.json({ status: 'analyzing', taskId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
