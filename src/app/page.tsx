'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { CrawlList } from '@/components/crawl/crawl-list';
import { Plus, Globe, BarChart3, FileText } from 'lucide-react';

interface CrawlRow {
  id: string;
  baseUrl: string;
  status: string;
  pagesCrawled: number;
  overallGrade: string | null;
  premiumScore: number | null;
  createdAt: string;
}

export default function DashboardPage() {
  const [crawls, setCrawls] = useState<CrawlRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crawl')
      .then((r) => r.json())
      .then((data) => setCrawls(data.crawls ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalPages = crawls.reduce((s, c) => s + c.pagesCrawled, 0);
  const graded = crawls.filter((c) => c.premiumScore != null);
  const avgScore = graded.length > 0
    ? Math.round(graded.reduce((s, c) => s + (c.premiumScore ?? 0), 0) / graded.length)
    : 0;

  return (
    <>
      <Header
        title="Dashboard"
        description="Overview of your crawl and analysis activity"
        actions={
          <Link href="/crawl">
            <Button>
              <Plus className="w-4 h-4" />
              New Crawl
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <Globe className="w-4 h-4" />
              <CardTitle>Total Crawls</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-text">{crawls.length}</p>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <FileText className="w-4 h-4" />
              <CardTitle>Pages Crawled</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-text">{totalPages}</p>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-muted">
              <BarChart3 className="w-4 h-4" />
              <CardTitle>Avg Score</CardTitle>
            </div>
          </CardHeader>
          <p className="text-3xl font-bold text-accent">{avgScore > 0 ? `${avgScore}/100` : '--'}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Crawls</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="text-center py-8 text-muted">Loading...</div>
        ) : (
          <CrawlList crawls={crawls} />
        )}
      </Card>
    </>
  );
}
