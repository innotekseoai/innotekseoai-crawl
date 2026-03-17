/**
 * Native HTTP Crawler
 *
 * Lightweight HTTP-only crawler using:
 * - cheerio for link discovery
 * - @mozilla/readability + jsdom for content extraction
 * - TurndownService for HTML → Markdown conversion
 * - p-limit for concurrent page fetching
 * - Optional Playwright fallback for JS-heavy pages (< 1000 chars)
 */

import { load as cheerioLoad } from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import pLimit from 'p-limit';
import TurndownService from 'turndown';
import { fetchRobotsTxt, isAllowed, USER_AGENT } from './robots.js';
import { fetchSitemapUrls, STATIC_ASSET_EXTENSIONS } from './sitemap.js';
import { normalizeUrl } from './url-normalize.js';
import { withRetry } from './retry.js';
import { DomainRateLimiter } from './rate-limiter.js';
import type { CrawlResult, CrawlOptions, CrawlPageMetadata, PlaywrightBrowserLike } from './types.js';

/**
 * Detect if HTML likely needs JS rendering using DOM heuristics.
 * Returns true if content appears thin/JS-dependent.
 */
function isLikelyJsRendered(html: string): boolean {
  const $ = cheerioLoad(html);

  // Heuristic 1: paragraph count — real content pages usually have 2+ paragraphs
  const pCount = $('p').length;

  // Heuristic 2: presence of main content containers
  const hasContentElement = $('main, article, [role="main"]').length > 0;

  // Heuristic 3: text-to-tag ratio (low = boilerplate/JS shell)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const uniqueWords = new Set(bodyText.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  // Heuristic 4: common SPA framework markers
  const hasSpaMarker = $('div#root, div#app, div#__next, div[data-reactroot]').length > 0
    && bodyText.length < 500;

  // Thin content: few paragraphs, no content containers, few unique words, or SPA shell
  if (hasSpaMarker) return true;
  if (pCount < 2 && !hasContentElement && uniqueWords.size < 20) return true;
  if (bodyText.length < 200 && uniqueWords.size < 15) return true;

  return false;
}
const TOTAL_TIMEOUT_MS = 300_000;
const FETCH_TIMEOUT_MS = 15_000;
const PLAYWRIGHT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 5;

interface FetchResult {
  html: string;
  markdown: string;
  metadata: CrawlPageMetadata;
}

async function fetchAndExtract(url: string, externalSignal?: AbortSignal): Promise<FetchResult> {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  // Follow redirects manually to capture redirect chain
  const redirectChain: string[] = [];
  let finalRes: Response;

  // Combine external abort signal with per-fetch timeout
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signals = externalSignal ? [timeoutSignal, externalSignal] : [timeoutSignal];
  const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : timeoutSignal;

  const res = await fetch(url, {
    signal: combinedSignal,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  finalRes = res;

  // Detect redirects via URL mismatch
  if (res.url && res.url !== url) {
    redirectChain.push(url, res.url);
  }

  if (!finalRes.ok) throw new Error(`HTTP ${finalRes.status}`);
  const html = await finalRes.text();

  const dom = new JSDOM(html, { url: finalRes.url || url });
  const doc = dom.window.document;

  // Extract extended metadata from DOM
  const getMeta = (name: string) =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
    doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
    undefined;

  const description = getMeta('description');
  const canonicalUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? undefined;
  const ogTitle = getMeta('og:title');
  const ogDescription = getMeta('og:description');
  const ogImage = getMeta('og:image');
  const robotsMeta = getMeta('robots');
  const viewport = getMeta('viewport');

  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  let markdown: string;
  if (article?.content && article.content.length > 50) {
    markdown = turndown.turndown(article.content);
  } else {
    const bodyHtml = doc.body?.innerHTML ?? html;
    markdown = turndown.turndown(bodyHtml);
  }

  return {
    html,
    markdown,
    metadata: {
      title: article?.title || doc.title || undefined,
      description,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      robotsMeta,
      httpStatus: finalRes.status,
      redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
      viewport,
    },
  };
}

function discoverLinks(html: string, baseUrl: string): string[] {
  const $ = cheerioLoad(html);
  const baseDomain = new URL(baseUrl).hostname;
  const seen = new Set<string>();
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (!href) return;
      const normalized = normalizeUrl(href, baseUrl);
      if (!normalized) return;
      const url = new URL(normalized);
      if (url.hostname === baseDomain && !seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch { /* ignore malformed URLs */ }
  });

  return links;
}

async function fetchWithPlaywright(url: string, browser: PlaywrightBrowserLike): Promise<string> {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    return turndown.turndown(bodyHtml);
  } finally {
    await context.close();
  }
}

type PageResult = {
  url: string;
  markdown: string;
  metadata: CrawlPageMetadata;
  links: string[];
  tier2: boolean;
};

export async function crawlNative(
  baseUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const limit = options.limit ?? 50;
  const maxDepth = options.maxDepth;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const signal = options.signal;
  const startTime = Date.now();

  const notify = options.onProgress;

  notify?.({ type: 'robots', message: `Fetching robots.txt from ${new URL(baseUrl).hostname}` });
  const { robots, content: robotsTxtContent } = await fetchRobotsTxt(baseUrl);
  notify?.({ type: 'robots', message: robots ? 'robots.txt loaded — checking rules' : 'No robots.txt found — all paths allowed' });

  notify?.({ type: 'sitemap', message: 'Discovering sitemap URLs...' });
  const sitemapUrls = await fetchSitemapUrls(baseUrl, robotsTxtContent);
  if (sitemapUrls.length > 0) {
    notify?.({ type: 'sitemap', message: `Found ${sitemapUrls.length} URLs in sitemap` });
  } else {
    notify?.({ type: 'sitemap', message: 'No sitemap found — will discover pages via BFS link crawling' });
  }

  const normalizedBase = normalizeUrl(baseUrl) ?? baseUrl;
  const seedUrls =
    sitemapUrls.length > 0
      ? [...new Set([...sitemapUrls.map(u => normalizeUrl(u) ?? u), normalizedBase])]
      : [normalizedBase];

  const limiter = pLimit(concurrency);
  const rateLimiter = new DomainRateLimiter(200);
  const pages: CrawlResult['pages'] = [];
  const visitedUrls = new Set<string>();
  const pendingUrls = new Set<string>();
  const urlQueue: Array<{ url: string; depth: number }> = [];
  const urlDepth = new Map<string, number>();
  let tier2FallbackCount = 0;
  let robotsBlockedCount = 0;
  let totalDiscovered = seedUrls.length;

  for (const url of seedUrls) {
    const norm = normalizeUrl(url) ?? url;
    if (!visitedUrls.has(norm)) {
      urlQueue.push({ url: norm, depth: 0 });
      pendingUrls.add(norm);
      urlDepth.set(norm, 0);
    }
  }

  while (pages.length < limit && urlQueue.length > 0) {
    if (signal?.aborted) {
      console.log('[crawler] Crawl cancelled via abort signal');
      break;
    }
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      console.warn('[crawler] Total timeout reached');
      break;
    }

    const batchEntries: Array<{ url: string; depth: number }> = [];
    while (
      batchEntries.length < Math.min(concurrency, limit - pages.length) &&
      urlQueue.length > 0
    ) {
      const entry = urlQueue.shift()!;
      pendingUrls.delete(entry.url);
      if (visitedUrls.has(entry.url)) continue;
      if (STATIC_ASSET_EXTENSIONS.test(new URL(entry.url).pathname)) continue;
      if (!isAllowed(robots, entry.url)) {
        console.log(`[crawler] Blocked by robots.txt: ${entry.url}`);
        robotsBlockedCount++;
        notify?.({ type: 'blocked', message: `Blocked by robots.txt: ${new URL(entry.url).pathname}` });
        continue;
      }
      visitedUrls.add(entry.url);
      batchEntries.push(entry);
    }

    if (batchEntries.length === 0) continue;

    const batchResults = await Promise.all(
      batchEntries.map((entry) =>
        limiter(async (): Promise<(PageResult & { depth: number }) | null> => {
          if (signal?.aborted) return null;
          console.log(`[crawler] Fetching: ${entry.url} (depth ${entry.depth})`);
          try {
            await rateLimiter.throttle(entry.url);
            const fetchResult = await withRetry(
              () => fetchAndExtract(entry.url, signal),
              {
                maxRetries: 2,
                baseDelay: 500,
                onRetry: (attempt, err) => {
                  console.log(`[crawler] Retry ${attempt} for ${entry.url}: ${err.message}`);
                },
              }
            );
            let finalMarkdown = fetchResult.markdown;
            let tier2 = false;

            if (isLikelyJsRendered(fetchResult.html) && options.getBrowser) {
              console.log(`[crawler] Tier 2 fallback: ${entry.url} (JS-rendered content detected)`);
              try {
                const browser = await options.getBrowser();
                finalMarkdown = await fetchWithPlaywright(entry.url, browser);
                tier2 = true;
              } catch (pErr) {
                console.warn(
                  `[crawler] Playwright fallback failed for ${entry.url}: ${
                    pErr instanceof Error ? pErr.message : String(pErr)
                  }`
                );
              }
            }

            const links = discoverLinks(fetchResult.html, baseUrl);
            return { url: entry.url, markdown: finalMarkdown, metadata: fetchResult.metadata, links, tier2, depth: entry.depth };
          } catch (err) {
            console.error(
              `[crawler] Failed: ${entry.url} — ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          }
        })
      )
    );

    for (const result of batchResults) {
      if (!result) continue;
      if (result.tier2) tier2FallbackCount++;

      // Only discover child links if within depth limit
      const childDepth = result.depth + 1;
      if (maxDepth === undefined || childDepth <= maxDepth) {
        for (const link of result.links) {
          // Links are already normalized by discoverLinks() — no second pass needed
          if (!visitedUrls.has(link) && !pendingUrls.has(link)) {
            urlQueue.push({ url: link, depth: childDepth });
            pendingUrls.add(link);
            urlDepth.set(link, childDepth);
            totalDiscovered++;
          }
        }
      }

      if (pages.length >= limit) continue;

      const crawledPage = {
        url: result.url,
        markdown: result.markdown,
        metadata: result.metadata,
      };

      pages.push(crawledPage);
      console.log(
        `[crawler] Saved: ${result.url} (${result.markdown.length} chars${result.tier2 ? ' [T2]' : ''})`
      );

      if (options.onPage) {
        try {
          await options.onPage(crawledPage, pages.length - 1);
        } catch (cbErr) {
          console.error(`[crawler] onPage callback error: ${cbErr}`);
        }
      }
    }
  }

  if (signal?.aborted) {
    notify?.({ type: 'queue', message: `Crawl cancelled — ${pages.length} pages fetched before stop` });
    return { success: pages.length > 0, pages, tier2FallbackCount, totalDiscovered, robotsBlocked: robotsBlockedCount, sitemapUrlCount: sitemapUrls.length };
  }

  if (pages.length === 0) {
    return { success: false, pages: [], error: 'No pages could be crawled', tier2FallbackCount, totalDiscovered, robotsBlocked: robotsBlockedCount, sitemapUrlCount: sitemapUrls.length };
  }

  notify?.({ type: 'queue', message: `Crawl finished — ${pages.length} pages fetched, ${totalDiscovered} URLs discovered, ${robotsBlockedCount} blocked by robots.txt` });

  console.log(`[crawler] Completed: ${pages.length} pages (${tier2FallbackCount} T2 fallbacks)`);
  return { success: true, pages, tier2FallbackCount, totalDiscovered, robotsBlocked: robotsBlockedCount, sitemapUrlCount: sitemapUrls.length };
}
