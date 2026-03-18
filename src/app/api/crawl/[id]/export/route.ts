import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls, crawlPages, pageAnalyses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

export const GET = withAuth(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get('format') ?? 'json';

  try {
    const db = await getDb();
    const [crawl] = await db.select().from(crawls).where(eq(crawls.id, id));
    if (!crawl) {
      return NextResponse.json({ error: 'Crawl not found' }, { status: 404 });
    }

    const pages = await db.select().from(crawlPages).where(eq(crawlPages.crawlId, id));
    const analyses = await db.select().from(pageAnalyses).where(eq(pageAnalyses.crawlId, id));
    const analysisMap = new Map(analyses.map((a) => [a.url, a]));

    const hostname = new URL(crawl.baseUrl).hostname;
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const headers = [
        'url', 'title', 'char_count', 'entity_clarity', 'content_quality',
        'semantic_structure', 'entity_richness', 'citation_readiness',
        'technical_seo', 'user_intent', 'trust_signals', 'authority',
        'fact_density', 'word_count', 'recommendations',
      ];

      const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = pages.map((p) => {
        const a = analysisMap.get(p.url);
        return [
          p.url,
          p.title ?? '',
          p.charCount ?? '',
          a?.entityClarityScore ?? '',
          a?.contentQualityScore ?? '',
          a?.semanticStructureScore ?? '',
          a?.entityRichnessScore ?? '',
          a?.citationReadinessScore ?? '',
          a?.technicalSeoScore ?? '',
          a?.userIntentAlignmentScore ?? '',
          a?.trustSignalsScore ?? '',
          a?.authorityScore ?? '',
          a?.factDensityCount ?? '',
          a?.wordCount ?? '',
          a?.geoRecommendations ?? '',
        ].map(csvEscape).join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${hostname}-${timestamp}.csv"`,
        },
      });
    }

    // JSON export
    const data = {
      crawl: {
        id: crawl.id,
        baseUrl: crawl.baseUrl,
        status: crawl.status,
        overallGrade: crawl.overallGrade,
        premiumScore: crawl.premiumScore,
        pagesCrawled: crawl.pagesCrawled,
        createdAt: crawl.createdAt,
      },
      pages: pages.map((p) => {
        const a = analysisMap.get(p.url);
        return {
          url: p.url,
          title: p.title,
          charCount: p.charCount,
          scores: a ? {
            entity_clarity: a.entityClarityScore,
            content_quality: a.contentQualityScore,
            semantic_structure: a.semanticStructureScore,
            entity_richness: a.entityRichnessScore,
            citation_readiness: a.citationReadinessScore,
            technical_seo: a.technicalSeoScore,
            user_intent: a.userIntentAlignmentScore,
            trust_signals: a.trustSignalsScore,
            authority: a.authorityScore,
            fact_density: a.factDensityCount,
            word_count: a.wordCount,
          } : null,
          recommendations: a ? JSON.parse(a.geoRecommendations ?? '[]') : [],
        };
      }),
    };

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${hostname}-${timestamp}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
