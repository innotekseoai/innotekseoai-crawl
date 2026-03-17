'use client';

import Link from 'next/link';
import { StatusBadge, GradeBadge } from '@/components/ui/badge';

interface CrawlRow {
  id: string;
  baseUrl: string;
  status: string;
  pagesCrawled: number;
  overallGrade: string | null;
  premiumScore: number | null;
  createdAt: string;
}

export function CrawlList({ crawls }: { crawls: CrawlRow[] }) {
  if (crawls.length === 0) {
    return (
      <div className="text-center py-16 text-muted">
        <p className="text-lg mb-2">No crawls yet</p>
        <p className="text-sm">Start your first crawl to see results here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-sm min-w-[540px]">
        <thead>
          <tr className="border-b border-border text-muted text-left">
            <th className="pb-3 pr-4 font-medium">URL</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Pages</th>
            <th className="pb-3 pr-4 font-medium">Grade</th>
            <th className="pb-3 pr-4 font-medium">Score</th>
            <th className="pb-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {crawls.map((crawl) => (
            <tr key={crawl.id} className="border-b border-border/50 hover:bg-surface2/50 transition-colors">
              <td className="py-3 pr-4">
                <Link href={`/crawl/${crawl.id}`} className="text-accent hover:underline truncate block max-w-xs">
                  {crawl.baseUrl}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={crawl.status} />
              </td>
              <td className="py-3 pr-4 text-muted">{crawl.pagesCrawled}</td>
              <td className="py-3 pr-4">
                {crawl.overallGrade ? <GradeBadge grade={crawl.overallGrade} /> : <span className="text-muted">--</span>}
              </td>
              <td className="py-3 pr-4 text-muted">
                {crawl.premiumScore != null ? `${crawl.premiumScore}/100` : '--'}
              </td>
              <td className="py-3 text-muted">
                {new Date(crawl.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
