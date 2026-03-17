/**
 * Sitemap discovery — extracts page URLs from sitemap.xml
 */

import { USER_AGENT } from './robots.js';

const STATIC_ASSET_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|woff|woff2|ttf|eot|ico|mp4|mp3|wav)$/i;

function extractUrlEntries(xml: string): Array<{ url: string; priority: number }> {
  const entries: Array<{ url: string; priority: number }> = [];
  const locRegex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  const priorityRegex = /<priority>([\d.]+)<\/priority>/gi;

  const locs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(xml)) !== null) locs.push(m[1]);

  const priorities: number[] = [];
  while ((m = priorityRegex.exec(xml)) !== null) priorities.push(parseFloat(m[1]));

  for (let i = 0; i < locs.length; i++) {
    entries.push({ url: locs[i], priority: priorities[i] ?? 0.5 });
  }
  return entries;
}

export async function fetchSitemapUrls(
  baseUrl: string,
  robotsTxtContent: string
): Promise<string[]> {
  const baseHostname = new URL(baseUrl).hostname;

  const candidates: string[] = [];
  for (const line of robotsTxtContent.split('\n')) {
    const m = /^Sitemap:\s*(.+)/i.exec(line.trim());
    if (m) candidates.push(m[1].trim());
  }
  const defaultSitemap = new URL('/sitemap.xml', baseUrl).toString();
  if (!candidates.includes(defaultSitemap)) candidates.push(defaultSitemap);

  const collected: Array<{ url: string; priority: number }> = [];
  const seen = new Set<string>();

  async function processSitemap(url: string): Promise<void> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) return;
      const xml = await res.text();

      if (xml.includes('<sitemapindex')) {
        const childUrls = extractUrlEntries(xml).map((e) => e.url);
        await Promise.all(
          childUrls.slice(0, 20).map(async (childUrl) => {
            try {
              const childRes = await fetch(childUrl, {
                signal: AbortSignal.timeout(8000),
                headers: { 'User-Agent': USER_AGENT },
              });
              if (!childRes.ok) return;
              const childXml = await childRes.text();
              for (const entry of extractUrlEntries(childXml)) {
                if (!seen.has(entry.url)) {
                  seen.add(entry.url);
                  collected.push(entry);
                }
              }
            } catch { /* ignore child failures */ }
          })
        );
      } else {
        for (const entry of extractUrlEntries(xml)) {
          if (!seen.has(entry.url)) {
            seen.add(entry.url);
            collected.push(entry);
          }
        }
      }
    } catch { /* ignore fetch failures */ }
  }

  await Promise.all(candidates.slice(0, 5).map(processSitemap));

  const pageUrls = collected
    .filter((e) => {
      try {
        return (
          new URL(e.url).hostname === baseHostname &&
          !STATIC_ASSET_EXTENSIONS.test(new URL(e.url).pathname)
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.priority - a.priority)
    .map((e) => e.url);

  if (pageUrls.length > 0) {
    console.log(`[sitemap] Found ${pageUrls.length} URLs`);
  } else {
    console.log('[sitemap] No sitemap found, will use BFS from homepage');
  }
  return pageUrls;
}

export { STATIC_ASSET_EXTENSIONS };
