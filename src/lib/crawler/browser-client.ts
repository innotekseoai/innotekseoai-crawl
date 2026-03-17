/**
 * Browser Crawler (Playwright)
 *
 * Full browser-based crawler for JS-heavy sites.
 * Playwright is an optional peer dependency — this module
 * gracefully errors if not installed.
 */

import TurndownService from 'turndown';
import { fetchRobotsTxt, isAllowed, USER_AGENT } from './robots.js';
import { fetchSitemapUrls, STATIC_ASSET_EXTENSIONS } from './sitemap.js';
import type { CrawlResult, CrawlOptions } from './types.js';

const DEFAULT_DELAY_MS = 1000;
const PAGE_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 300_000;

export async function crawlBrowser(
  baseUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const limit = options.limit ?? 50;

  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    return {
      success: false,
      pages: [],
      error: 'Playwright is not installed. Run: npm install playwright',
    };
  }

  const startTime = Date.now();
  let browser;

  try {
    const { robots, content: robotsTxtContent } = await fetchRobotsTxt(baseUrl);
    const sitemapUrls = await fetchSitemapUrls(baseUrl, robotsTxtContent);

    const normalizedBase = baseUrl.replace(/\/$/, '') + '/';
    const seedUrls =
      sitemapUrls.length > 0
        ? [...new Set([...sitemapUrls, normalizedBase, baseUrl])]
        : [baseUrl];

    console.log('[browser-crawler] Launching browser...');
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    const pages: CrawlResult['pages'] = [];
    const visitedUrls = new Set<string>();
    const urlsToVisit: string[] = [...seedUrls];

    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

    while (pages.length < limit && urlsToVisit.length > 0) {
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn('[browser-crawler] Total timeout reached');
        break;
      }

      const currentUrl = urlsToVisit.shift()!;
      if (visitedUrls.has(currentUrl)) continue;
      if (!isAllowed(robots, currentUrl)) {
        console.log(`[browser-crawler] Blocked by robots.txt: ${currentUrl}`);
        continue;
      }
      if (STATIC_ASSET_EXTENSIONS.test(new URL(currentUrl).pathname)) continue;

      visitedUrls.add(currentUrl);

      try {
        console.log(`[browser-crawler] Crawling: ${currentUrl}`);
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });

        const [title, description, html] = await Promise.all([
          page.title().catch(() => undefined),
          page
            .$eval('meta[name="description"]', (el: Element) => el.getAttribute('content') ?? '')
            .catch(() => ''),
          page.evaluate(() => document.body.innerHTML),
        ]);

        const markdown = turndown.turndown(html);

        const crawledPage = {
          url: currentUrl,
          markdown,
          metadata: { title, description: description || undefined },
        };

        pages.push(crawledPage);
        console.log(`[browser-crawler] Saved: ${currentUrl} (${markdown.length} chars)`);

        if (options.onPage) {
          try {
            await options.onPage(crawledPage, pages.length - 1);
          } catch (cbErr) {
            console.error(`[browser-crawler] onPage error: ${cbErr}`);
          }
        }

        if (pages.length < limit) {
          const baseDomain = new URL(baseUrl).hostname;
          const links: string[] = await page.$$eval(
            'a[href]',
            (anchors: Element[], domain: string) => {
              return anchors
                .map((a) => {
                  try {
                    const href = a.getAttribute('href');
                    if (!href) return null;
                    const url = new URL(href, window.location.href);
                    url.hash = '';
                    if (url.hostname === domain) return url.toString();
                    return null;
                  } catch {
                    return null;
                  }
                })
                .filter((u): u is string => u !== null);
            },
            baseDomain
          );

          for (const link of [...new Set(links)]) {
            if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
              urlsToVisit.push(link);
            }
          }
        }

        // Polite delay
        if (pages.length < limit && urlsToVisit.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, DEFAULT_DELAY_MS));
        }
      } catch (error) {
        console.error(`[browser-crawler] Failed: ${currentUrl} — ${error}`);
      }
    }

    await context.close();
    await browser.close();

    if (pages.length === 0) {
      return { success: false, pages: [], error: 'No pages could be crawled' };
    }

    console.log(`[browser-crawler] Completed: ${pages.length} pages`);
    return { success: true, pages };
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    return {
      success: false,
      pages: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
