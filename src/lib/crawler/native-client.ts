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
import type { CrawlResult, CrawlOptions, PlaywrightBrowserLike } from './types.js';

const THIN_CONTENT_THRESHOLD = 1000;
const TOTAL_TIMEOUT_MS = 300_000;
const FETCH_TIMEOUT_MS = 15_000;
const PLAYWRIGHT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 5;

interface FetchResult {
  html: string;
  markdown: string;
  title?: string;
  description?: string;
}

async function fetchAndExtract(url: string): Promise<FetchResult> {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const description =
    dom.window.document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content') ?? undefined;

  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  let markdown: string;
  if (article?.content && article.content.length > 50) {
    markdown = turndown.turndown(article.content);
  } else {
    const bodyHtml = dom.window.document.body?.innerHTML ?? html;
    markdown = turndown.turndown(bodyHtml);
  }

  return {
    html,
    markdown,
    title: article?.title || dom.window.document.title || undefined,
    description,
  };
}

function discoverLinks(html: string, baseUrl: string): string[] {
  const $ = cheerioLoad(html);
  const baseDomain = new URL(baseUrl).hostname;
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (!href) return;
      const url = new URL(href, baseUrl);
      url.hash = '';
      if (url.hostname === baseDomain) {
        links.push(url.toString());
      }
    } catch { /* ignore malformed URLs */ }
  });

  return Array.from(new Set(links));
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
  title?: string;
  description?: string;
  links: string[];
  tier2: boolean;
};

export async function crawlNative(
  baseUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const limit = options.limit ?? 50;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
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

  const normalizedBase = baseUrl.replace(/\/$/, '') + '/';
  const seedUrls =
    sitemapUrls.length > 0
      ? [...new Set([...sitemapUrls, normalizedBase, baseUrl])]
      : [baseUrl];

  const limiter = pLimit(concurrency);
  const pages: CrawlResult['pages'] = [];
  const visitedUrls = new Set<string>();
  const pendingUrls = new Set<string>();
  const urlQueue: string[] = [];
  let tier2FallbackCount = 0;
  let robotsBlockedCount = 0;
  let totalDiscovered = seedUrls.length;

  for (const url of seedUrls) {
    if (!visitedUrls.has(url)) {
      urlQueue.push(url);
      pendingUrls.add(url);
    }
  }

  while (pages.length < limit && urlQueue.length > 0) {
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      console.warn('[crawler] Total timeout reached');
      break;
    }

    const batchUrls: string[] = [];
    while (
      batchUrls.length < Math.min(concurrency, limit - pages.length) &&
      urlQueue.length > 0
    ) {
      const url = urlQueue.shift()!;
      pendingUrls.delete(url);
      if (visitedUrls.has(url)) continue;
      if (STATIC_ASSET_EXTENSIONS.test(new URL(url).pathname)) continue;
      if (!isAllowed(robots, url)) {
        console.log(`[crawler] Blocked by robots.txt: ${url}`);
        robotsBlockedCount++;
        notify?.({ type: 'blocked', message: `Blocked by robots.txt: ${new URL(url).pathname}` });
        continue;
      }
      visitedUrls.add(url);
      batchUrls.push(url);
    }

    if (batchUrls.length === 0) continue;

    const batchResults = await Promise.all(
      batchUrls.map((url) =>
        limiter(async (): Promise<PageResult | null> => {
          console.log(`[crawler] Fetching: ${url}`);
          try {
            const { html, markdown, title, description } = await fetchAndExtract(url);
            let finalMarkdown = markdown;
            let tier2 = false;

            if (markdown.length < THIN_CONTENT_THRESHOLD && options.getBrowser) {
              console.log(`[crawler] Tier 2 fallback: ${url} (${markdown.length} chars)`);
              try {
                const browser = await options.getBrowser();
                finalMarkdown = await fetchWithPlaywright(url, browser);
                tier2 = true;
              } catch (pErr) {
                console.warn(
                  `[crawler] Playwright fallback failed for ${url}: ${
                    pErr instanceof Error ? pErr.message : String(pErr)
                  }`
                );
              }
            }

            const links = discoverLinks(html, baseUrl);
            return { url, markdown: finalMarkdown, title, description, links, tier2 };
          } catch (err) {
            console.error(
              `[crawler] Failed: ${url} — ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
          }
        })
      )
    );

    for (const result of batchResults) {
      if (!result) continue;
      if (result.tier2) tier2FallbackCount++;

      let newLinksFound = 0;
      for (const link of result.links) {
        if (!visitedUrls.has(link) && !pendingUrls.has(link)) {
          urlQueue.push(link);
          pendingUrls.add(link);
          totalDiscovered++;
          newLinksFound++;
        }
      }

      if (pages.length >= limit) continue;

      const crawledPage = {
        url: result.url,
        markdown: result.markdown,
        metadata: { title: result.title, description: result.description },
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

  if (pages.length === 0) {
    return { success: false, pages: [], error: 'No pages could be crawled', tier2FallbackCount, totalDiscovered, robotsBlocked: robotsBlockedCount, sitemapUrlCount: sitemapUrls.length };
  }

  notify?.({ type: 'queue', message: `Crawl finished — ${pages.length} pages fetched, ${totalDiscovered} URLs discovered, ${robotsBlockedCount} blocked by robots.txt` });

  console.log(`[crawler] Completed: ${pages.length} pages (${tier2FallbackCount} T2 fallbacks)`);
  return { success: true, pages, tier2FallbackCount, totalDiscovered, robotsBlocked: robotsBlockedCount, sitemapUrlCount: sitemapUrls.length };
}
