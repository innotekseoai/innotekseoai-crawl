'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { CrawlTerminal } from '@/components/crawl/crawl-terminal';
import type { ConsoleLine } from '@/components/crawl/crawl-terminal';
import { ProgressSteps } from '@/components/analysis/progress-steps';
import { ScoreChart } from '@/components/analysis/score-chart';
import { GradeBreakdown } from '@/components/analysis/grade-breakdown';
import { MetricBars } from '@/components/analysis/metric-bars';
import { Recommendations } from '@/components/analysis/recommendations';
import { PageScoreCell } from '@/components/crawl/page-score-cell';
import { ArrowLeft, Copy, RotateCcw, Square, ArrowUpDown, Download, GitCompare } from 'lucide-react';
import { ComparisonChart } from '@/components/analysis/comparison-chart';
import Link from 'next/link';

interface CrawlData {
  crawl: {
    id: string;
    baseUrl: string;
    status: string;
    pagesCrawled: number;
    pageLimit: number;
    crawlerType: string;
    overallGrade: string | null;
    premiumScore: number | null;
    primaryJsonLd: string | null;
    llmsTxt: string | null;
    siteMetrics: any | null;
    modelUsed: string | null;
    createdAt: string;
    errorMessage: string | null;
  };
  pages: Array<{
    id: string;
    url: string;
    title: string | null;
    charCount: number | null;
  }>;
  analyses: Array<{
    id: string;
    url: string;
    entityClarityScore: number | null;
    contentQualityScore: number | null;
    semanticStructureScore: number | null;
    entityRichnessScore: number | null;
    citationReadinessScore: number | null;
    technicalSeoScore: number | null;
    userIntentAlignmentScore: number | null;
    trustSignalsScore: number | null;
    authorityScore: number | null;
    geoRecommendations: string | null;
  }>;
}

export default function CrawlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const [data, setData] = useState<CrawlData | null>(null);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [sseStatus, setSseStatus] = useState<string>('pending');
  const [sseProgress, setSseProgress] = useState(0);
  const [sseMessage, setSseMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [comparison, setComparison] = useState<any>(null);
  const [comparing, setComparing] = useState(false);
  const startedRef = useRef(false);

  const pageLineCount = lines.filter((l) => l.type === 'page').length;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/crawl/${id}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        // Sync status from DB on fetch
        if (d.crawl?.status === 'completed' || d.crawl?.status === 'failed') {
          setSseStatus(d.crawl.status);
        }
        if (d.pages?.length && lines.length === 0) {
          setLines(d.pages.map((p: any, i: number) => ({
            type: 'page' as const,
            data: { url: p.url, title: p.title, charCount: p.charCount ?? 0, index: i },
          })));
        }
      }
    } catch {}
  }, [id, lines.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // SSE connection — opens once on mount, replays buffered events, streams live
  useEffect(() => {
    const es = new EventSource(`/api/crawl/${id}/stream`);

    // Once SSE is connected, trigger the pipeline if this is a new crawl
    es.addEventListener('connected', () => {
      if (startedRef.current) return;
      if (searchParams.get('autostart') === '1') {
        startedRef.current = true;
        fetch(`/api/crawl/${id}/start`, { method: 'POST' }).catch(() => {});
      }
    });

    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      const msg: string = d.message ?? '';
      if (msg.startsWith('Analyzing:') || msg.startsWith('Loading AI model')) {
        setSseStatus('analyzing');
      } else if (d.status === 'running') {
        setSseStatus('crawling');
      } else if (d.status === 'completed') {
        setSseStatus('completed');
      } else if (d.status === 'failed') {
        setSseStatus('failed');
      }
      setSseProgress(d.progress);
      setSseMessage(msg);
    });

    es.addEventListener('page', (e) => {
      const d = JSON.parse(e.data);
      setLines((prev) => {
        if (prev.some((l) => l.type === 'page' && l.data.index === d.index)) return prev;
        return [...prev, { type: 'page' as const, data: { url: d.url, title: d.title, charCount: d.charCount, index: d.index } }];
      });
    });

    es.addEventListener('log', (e) => {
      const d = JSON.parse(e.data);
      setLines((prev) => {
        if (prev.some((l) => l.type === 'log' && l.data.id === d.id)) return prev;
        return [...prev, { type: 'log' as const, data: { id: d.id, level: d.level, message: d.message } }];
      });
    });

    es.addEventListener('complete', () => {
      setSseStatus('completed');
      es.close();
      // Delay re-fetch slightly to avoid race with DB write completing
      setTimeout(() => fetchData(), 500);
    });

    es.addEventListener('error', (e) => {
      const event = e as MessageEvent;
      if (event.data) {
        const d = JSON.parse(event.data);
        setSseStatus('failed');
        setSseMessage(d.error);
        es.close();
        fetchData();
      } else if (es.readyState === EventSource.CLOSED) {
        fetchData();
      }
    });

    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading crawl data...</div>
      </div>
    );
  }

  const { crawl, analyses } = data;
  const sm = crawl.siteMetrics;
  // Prefer SSE status over DB status (SSE is more up-to-date during live crawls)
  const effectiveStatus = sseStatus === 'running' ? 'crawling' : sseStatus;
  const isLive = ['crawling', 'analyzing', 'pending', 'running'].includes(effectiveStatus);
  const isComplete = effectiveStatus === 'completed';

  const steps: Array<{ label: string; status: 'pending' | 'active' | 'completed' | 'error'; detail?: string }> = [
    {
      label: 'Fetching robots.txt & sitemap',
      status: isLive && sseProgress < 10 ? 'active' : (sseProgress >= 10 || isComplete ? 'completed' : 'pending'),
    },
    {
      label: 'Crawling pages',
      status: isLive && sseProgress >= 5 && sseProgress < 90 ? 'active' : (sseProgress >= 90 || isComplete ? 'completed' : 'pending'),
      detail: isLive ? `${pageLineCount} pages found` : `${crawl.pagesCrawled} pages`,
    },
    {
      label: 'Analysis',
      status: crawl.status === 'analyzing' ? 'active' : (isComplete && sm ? 'completed' : 'pending'),
      detail: crawl.status === 'analyzing' ? sseMessage : undefined,
    },
  ];

  if (crawl.status === 'failed') {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: 'error',
      detail: crawl.errorMessage ?? 'Unknown error',
    };
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/crawl/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        setSseStatus('failed');
        setSseMessage('Cancelled by user');
        fetchData();
      }
    } catch {} finally {
      setCancelling(false);
    }
  }

  async function handleCompare() {
    setComparing(true);
    try {
      // Find previous crawl for the same base URL
      const listRes = await fetch('/api/crawl');
      const listData = await listRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sameDomain = (listData.crawls ?? []).filter((c: any) =>
        c.baseUrl === data?.crawl.baseUrl && c.id !== id && c.status === 'completed'
      );
      if (sameDomain.length === 0) {
        setComparison({ error: 'No previous crawls found for this domain' });
        return;
      }
      const prevId = sameDomain[0].id;
      const res = await fetch(`/api/crawl/compare?a=${prevId}&b=${id}`);
      if (res.ok) {
        setComparison(await res.json());
      } else {
        setComparison({ error: 'Both crawls need completed analysis to compare' });
      }
    } catch { setComparison({ error: 'Failed to load comparison' }); }
    finally { setComparing(false); }
  }

  async function handleResume() {
    setResuming(true);
    try {
      const res = await fetch(`/api/crawl/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyze: true }),
      });
      if (res.ok) {
        setSseStatus('crawling');
        fetchData();
      }
    } catch {} finally {
      setResuming(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  const premiumMetrics = sm ? [
    { label: 'Content Quality', value: sm.avg_content_quality },
    { label: 'Semantic Structure', value: sm.avg_semantic_structure },
    { label: 'Entity Richness', value: sm.avg_entity_richness },
    { label: 'Citation Readiness', value: sm.avg_citation_readiness },
    { label: 'Technical SEO', value: sm.avg_technical_seo },
    { label: 'User Intent', value: sm.avg_user_intent },
    { label: 'Trust Signals', value: sm.avg_trust_signals },
    { label: 'Authority', value: sm.avg_authority },
  ] : [];

  return (
    <>
      <Header
        title={crawl.baseUrl}
        description={`Crawl started ${new Date(crawl.createdAt).toLocaleString()}`}
        actions={
          <div className="flex gap-2">
            {isLive && (
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={cancelling}>
                <Square className="w-4 h-4" />
                {cancelling ? 'Stopping...' : 'Stop'}
              </Button>
            )}
            {isComplete && (
              <div className="flex gap-1">
                <a href={`/api/crawl/${id}/export?format=csv`} download>
                  <Button variant="ghost" size="sm"><Download className="w-4 h-4" /> CSV</Button>
                </a>
                <a href={`/api/crawl/${id}/export?format=json`} download>
                  <Button variant="ghost" size="sm"><Download className="w-4 h-4" /> JSON</Button>
                </a>
              </div>
            )}
            {(crawl.status === 'failed' || (crawl.status === 'completed' && !sm)) && (
              <Button variant="secondary" size="sm" onClick={handleResume} disabled={resuming}>
                <RotateCcw className={`w-4 h-4 ${resuming ? 'animate-spin' : ''}`} />
                Resume
              </Button>
            )}
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <StatusBadge status={crawl.status} />
        {isLive && (
          <div className="flex-1 min-w-24 max-w-xs">
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${sseProgress}%` }}
              />
            </div>
          </div>
        )}
        {isLive && <span className="text-xs text-muted">{sseProgress}%</span>}
      </div>

      {/* Progress + Details cards on mobile go first */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
          <ProgressSteps steps={steps} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Crawl ID</dt>
              <dd className="text-text font-mono text-xs truncate max-w-[140px]">{crawl.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Crawler</dt>
              <dd className="text-text">{crawl.crawlerType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Page Limit</dt>
              <dd className="text-text">{crawl.pageLimit}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Pages Found</dt>
              <dd className="text-text">{isLive ? pageLineCount : crawl.pagesCrawled}</dd>
            </div>
            {(crawl.modelUsed || sm?.model_used) && (
              <div className="flex justify-between">
                <dt className="text-muted">Model</dt>
                <dd className="text-text text-xs truncate max-w-[160px]">{sm?.model_used ?? crawl.modelUsed}</dd>
              </div>
            )}
            {sm?.inference_backend && (
              <div className="flex justify-between">
                <dt className="text-muted">Backend</dt>
                <dd className="text-text text-xs">{sm.inference_backend === 'gpu-opencl' ? 'GPU (OpenCL)' : sm.inference_backend === 'cpu-subprocess' ? 'CPU' : 'In-process'}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-2 space-y-6">
          {(isLive || lines.length > 0) && (
            <CrawlTerminal
              lines={lines}
              status={isLive ? (effectiveStatus as 'crawling' | 'analyzing') : (isComplete ? 'completed' : effectiveStatus === 'failed' ? 'failed' : 'idle')}
              baseUrl={crawl.baseUrl}
            />
          )}

          {isComplete && sm && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>GEO Score</CardTitle></CardHeader>
                  <div className="flex justify-center">
                    <ScoreChart score={crawl.premiumScore ?? 0} />
                  </div>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Grade Breakdown</CardTitle></CardHeader>
                  <GradeBreakdown
                    grade={crawl.overallGrade ?? 'F'}
                    entityClarity={sm.avg_entity_clarity}
                    wordsPerFact={sm.avg_words_per_fact}
                    schemaCompleteness={sm.schema_completeness_score}
                    totalFacts={sm.total_facts}
                  />
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Premium Metrics</CardTitle></CardHeader>
                <MetricBars metrics={premiumMetrics} />
              </Card>

              <Card>
                <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
                <Recommendations
                  priority={sm.priority_recommendations ?? []}
                  critical={sm.critical_issues ?? []}
                />
              </Card>
            </>
          )}

          {isComplete && data.pages.length > 0 && (() => {
            // Build page-analysis map for score display
            const analysisMap = new Map(analyses.map((a) => [a.url, a]));
            const pagesWithScores = data.pages.map((p, i) => {
              const a = analysisMap.get(p.url);
              const avgScore = a ? (
                ((a.entityClarityScore ?? 0) + (a.contentQualityScore ?? 0) + (a.semanticStructureScore ?? 0) +
                 (a.entityRichnessScore ?? 0) + (a.citationReadinessScore ?? 0) + (a.technicalSeoScore ?? 0) +
                 (a.userIntentAlignmentScore ?? 0) + (a.trustSignalsScore ?? 0) + (a.authorityScore ?? 0)) / 9
              ) : null;
              return { ...p, index: i, analysis: a ?? null, avgScore };
            });

            // Sort if field selected
            const sorted = sortField ? [...pagesWithScores].sort((a, b) => {
              let va: number | null = null, vb: number | null = null;
              if (sortField === 'avg') { va = a.avgScore; vb = b.avgScore; }
              else if (sortField === 'clarity') { va = a.analysis?.entityClarityScore ?? null; vb = b.analysis?.entityClarityScore ?? null; }
              else if (sortField === 'quality') { va = a.analysis?.contentQualityScore ?? null; vb = b.analysis?.contentQualityScore ?? null; }
              else if (sortField === 'seo') { va = a.analysis?.technicalSeoScore ?? null; vb = b.analysis?.technicalSeoScore ?? null; }
              if (va === null && vb === null) return 0;
              if (va === null) return 1;
              if (vb === null) return -1;
              return sortDir === 'asc' ? va - vb : vb - va;
            }) : pagesWithScores;

            function toggleSort(field: string) {
              if (sortField === field) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField(field);
                setSortDir('desc');
              }
            }

            return (
              <Card>
                <CardHeader><CardTitle>Crawled Pages ({data.pages.length})</CardTitle></CardHeader>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border text-muted text-left">
                        <th className="pb-2 pr-4 font-medium">#</th>
                        <th className="pb-2 pr-4 font-medium">URL</th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('avg')}>
                          Avg <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('clarity')}>
                          Clarity <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('quality')}>
                          Quality <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 pr-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('seo')}>
                          SEO <ArrowUpDown className="w-3 h-3 inline" />
                        </th>
                        <th className="pb-2 font-medium">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p) => (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-2 pr-4 text-muted">{p.index + 1}</td>
                          <td className="py-2 pr-4 text-accent truncate max-w-[200px]">{p.url}</td>
                          <td className="py-2 pr-2"><PageScoreCell score={p.avgScore} /></td>
                          <td className="py-2 pr-2"><PageScoreCell score={p.analysis?.entityClarityScore ?? null} /></td>
                          <td className="py-2 pr-2"><PageScoreCell score={p.analysis?.contentQualityScore ?? null} /></td>
                          <td className="py-2 pr-2"><PageScoreCell score={p.analysis?.technicalSeoScore ?? null} /></td>
                          <td className="py-2 text-muted font-mono">
                            {p.charCount ? `${(p.charCount / 1000).toFixed(1)}k` : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}

          {isComplete && sm && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Compare</CardTitle>
                  {!comparison && (
                    <Button variant="ghost" size="sm" onClick={handleCompare} disabled={comparing}>
                      <GitCompare className="w-4 h-4" />
                      {comparing ? 'Loading...' : 'Compare with previous'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              {comparison?.error && (
                <p className="text-xs text-muted">{comparison.error}</p>
              )}
              {comparison?.deltas && (
                <ComparisonChart
                  deltas={comparison.deltas}
                  beforeDate={comparison.before.date}
                  afterDate={comparison.after.date}
                />
              )}
              {!comparison && <p className="text-xs text-muted">Click to compare with the most recent previous crawl of this domain.</p>}
            </Card>
          )}

          {isComplete && (crawl.primaryJsonLd || crawl.llmsTxt) && (
            <Card>
              <CardHeader><CardTitle>Outputs</CardTitle></CardHeader>
              <div className="space-y-4">
                {crawl.primaryJsonLd && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted">JSON-LD</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(crawl.primaryJsonLd!, 'jsonld')}
                      >
                        <Copy className="w-3 h-3" />
                        {copied === 'jsonld' ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre className="bg-[#0a0e17] border border-border rounded-lg p-3 text-xs text-accent3 overflow-x-auto max-h-48">
                      {crawl.primaryJsonLd}
                    </pre>
                  </div>
                )}
                {crawl.llmsTxt && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted">llms.txt</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(crawl.llmsTxt!, 'llms')}
                      >
                        <Copy className="w-3 h-3" />
                        {copied === 'llms' ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre className="bg-[#0a0e17] border border-border rounded-lg p-3 text-xs text-text overflow-x-auto max-h-48">
                      {crawl.llmsTxt}
                    </pre>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Desktop sidebar — hidden on mobile (shown above instead) */}
        <div className="hidden lg:block space-y-6">
          <Card>
            <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
            <ProgressSteps steps={steps} />
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Crawl ID</dt>
                <dd className="text-text font-mono text-xs truncate max-w-[140px]">{crawl.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Crawler</dt>
                <dd className="text-text">{crawl.crawlerType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Page Limit</dt>
                <dd className="text-text">{crawl.pageLimit}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pages Found</dt>
                <dd className="text-text">{isLive ? pageLineCount : crawl.pagesCrawled}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
