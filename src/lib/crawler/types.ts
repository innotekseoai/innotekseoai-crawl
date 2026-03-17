/**
 * Crawler types — compatible with innotekseoai's NativeCrawlResult
 */

export interface CrawlPageMetadata {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  robotsMeta?: string;
  httpStatus?: number;
  redirectChain?: string[];
  viewport?: string;
}

export interface CrawlPage {
  url: string;
  markdown: string;
  metadata?: CrawlPageMetadata;
}

export interface CrawlResult {
  success: boolean;
  pages: CrawlPage[];
  error?: string;
  tier2FallbackCount?: number;
  totalDiscovered?: number;
  robotsBlocked?: number;
  sitemapUrlCount?: number;
}

export type OnPageCrawled = (page: CrawlPage, index: number) => Promise<void>;

export interface CrawlOptions {
  /** Callback for each crawled page (progressive results) */
  onPage?: OnPageCrawled;
  /** Callback for crawler progress events (sitemap found, robots blocked, etc.) */
  onProgress?: (event: CrawlProgressEvent) => void;
  /** Factory for lazy Playwright browser (Tier 2 fallback) */
  getBrowser?: () => Promise<PlaywrightBrowserLike>;
  /** Maximum pages to crawl */
  limit?: number;
  /** Maximum link depth from seed URL (0 = seed only, undefined = unlimited) */
  maxDepth?: number;
  /** Concurrency for native client */
  concurrency?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface CrawlProgressEvent {
  type: 'robots' | 'sitemap' | 'queue' | 'blocked' | 'error';
  message: string;
  detail?: string;
}

export type PlaywrightBrowserLike = {
  close(): Promise<void>;
  newContext(options?: { userAgent?: string }): Promise<{
    newPage(): Promise<{
      setDefaultTimeout(timeout: number): void;
      goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
      evaluate(pageFunction: () => string): Promise<string>;
      title(): Promise<string>;
      $eval(selector: string, fn: (el: Element) => string): Promise<string>;
      $$eval(
        selector: string,
        fn: (els: Element[], arg: string) => string[],
        arg: string
      ): Promise<string[]>;
    }>;
    close(): Promise<void>;
  }>;
};
