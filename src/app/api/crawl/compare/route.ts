import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { crawls } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth/with-auth';

function parseMetrics(siteMetrics: string | null) {
  if (!siteMetrics) return null;
  try {
    return JSON.parse(siteMetrics);
  } catch { return null; }
}

export const GET = withAuth(async function GET(request: NextRequest) {
  const a = request.nextUrl.searchParams.get('a');
  const b = request.nextUrl.searchParams.get('b');

  if (!a || !b) {
    return NextResponse.json({ error: 'Both ?a=<id>&b=<id> are required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [crawlA] = await db.select().from(crawls).where(eq(crawls.id, a));
    const [crawlB] = await db.select().from(crawls).where(eq(crawls.id, b));

    if (!crawlA || !crawlB) {
      return NextResponse.json({ error: 'One or both crawls not found' }, { status: 404 });
    }

    const metricsA = parseMetrics(crawlA.siteMetrics);
    const metricsB = parseMetrics(crawlB.siteMetrics);

    if (!metricsA || !metricsB) {
      return NextResponse.json({ error: 'Both crawls must have completed analysis' }, { status: 400 });
    }

    const fields = [
      'avg_entity_clarity', 'avg_content_quality', 'avg_semantic_structure',
      'avg_entity_richness', 'avg_citation_readiness', 'avg_technical_seo',
      'avg_user_intent', 'avg_trust_signals', 'avg_authority',
      'premium_score', 'schema_completeness_score',
    ];

    const deltas: Record<string, { before: number; after: number; delta: number }> = {};
    for (const field of fields) {
      const before = metricsA[field] ?? 0;
      const after = metricsB[field] ?? 0;
      deltas[field] = {
        before: Math.round(before * 100) / 100,
        after: Math.round(after * 100) / 100,
        delta: Math.round((after - before) * 100) / 100,
      };
    }

    return NextResponse.json({
      before: {
        id: crawlA.id,
        baseUrl: crawlA.baseUrl,
        grade: crawlA.overallGrade,
        premiumScore: crawlA.premiumScore,
        date: crawlA.createdAt,
      },
      after: {
        id: crawlB.id,
        baseUrl: crawlB.baseUrl,
        grade: crawlB.overallGrade,
        premiumScore: crawlB.premiumScore,
        date: crawlB.createdAt,
      },
      deltas,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
