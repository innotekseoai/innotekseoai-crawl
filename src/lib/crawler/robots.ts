/**
 * robots.txt fetcher and parser
 */

import robotsParser from 'robots-parser';

const USER_AGENT = 'InnotekSEO-Crawler/1.0';

export type RobotsResult = {
  robots: ReturnType<typeof robotsParser> | null;
  content: string;
};

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsResult> {
  const robotsTxtUrl = new URL('/robots.txt', baseUrl).toString();
  try {
    const res = await fetch(robotsTxtUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return { robots: null, content: '' };
    const content = await res.text();
    return { robots: robotsParser(robotsTxtUrl, content), content };
  } catch {
    return { robots: null, content: '' };
  }
}

export function isAllowed(
  robots: ReturnType<typeof robotsParser> | null,
  url: string
): boolean {
  if (!robots) return true;
  return robots.isAllowed(url, USER_AGENT) !== false;
}

export { USER_AGENT };
