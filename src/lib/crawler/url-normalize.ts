/**
 * URL Normalization for deduplication
 *
 * Ensures the same page isn't crawled under multiple URL variants.
 * Strips tracking params, lowercases host, sorts query, removes trailing slash.
 */

const TRACKING_PARAMS = new Set([
  // Google Analytics / UTM
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  // Facebook
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  // Google Ads
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  // Microsoft
  'msclkid',
  // HubSpot
  'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src', 'hsa_ad', 'hsa_acc', 'hsa_net', 'hsa_ver', 'hsa_la', 'hsa_ol', 'hsa_kw',
  // Misc tracking
  'mc_cid', 'mc_eid', '_ga', '_gl', '_hsenc', '_hsmi',
  'ref', 'referrer', 'source',
]);

/**
 * Normalize a URL for deduplication.
 *
 * - Lowercases scheme and host
 * - Removes default ports (80/443)
 * - Strips trailing slash (except root "/")
 * - Removes fragment
 * - Strips tracking/analytics query params
 * - Sorts remaining query params
 * - Removes empty query string
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const url = new URL(rawUrl, baseUrl);

    // Only crawl http(s)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    // Lowercase host (URL constructor already does this, but be explicit)
    url.hostname = url.hostname.toLowerCase();

    // Remove default ports
    if (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    ) {
      url.port = '';
    }

    // Remove fragment
    url.hash = '';

    // Strip tracking params and sort remaining
    const params = new URLSearchParams();
    const entries = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of entries) {
      params.append(key, value);
    }

    url.search = params.toString() ? `?${params.toString()}` : '';

    // Remove trailing slash (but keep root "/")
    let normalized = url.toString();
    if (normalized.endsWith('/') && new URL(normalized).pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return null;
  }
}
