/**
 * Minimal cron/frequency parser
 *
 * Supports:
 * - Named frequencies: "daily", "weekly", "monthly"
 * - Standard cron: "0 3 * * *" (minute hour dom month dow)
 *
 * Returns the next Date when the schedule should fire.
 */

export function nextRunDate(frequency: string, from: Date = new Date()): Date {
  const lower = frequency.trim().toLowerCase();

  switch (lower) {
    case 'daily': {
      const next = new Date(from);
      next.setDate(next.getDate() + 1);
      next.setHours(3, 0, 0, 0); // 3:00 AM
      return next;
    }
    case 'weekly': {
      const next = new Date(from);
      next.setDate(next.getDate() + 7);
      next.setHours(3, 0, 0, 0);
      return next;
    }
    case 'monthly': {
      const next = new Date(from);
      next.setMonth(next.getMonth() + 1);
      next.setHours(3, 0, 0, 0);
      return next;
    }
    default:
      return parseCron(frequency, from);
  }
}

/**
 * Parse standard 5-field cron expression: minute hour dom month dow
 * Returns the next matching Date after `from`.
 */
function parseCron(expression: string, from: Date): Date {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${expression}" — expected 5 fields`);
  }

  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;
  const minute = parseField(minExpr, 0, 59);
  const hour = parseField(hourExpr, 0, 23);
  const dom = parseField(domExpr, 1, 31);
  const month = parseField(monthExpr, 1, 12);
  const dow = parseField(dowExpr, 0, 6);

  // Brute-force search — check every minute for up to 400 days
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // Start from next minute

  const limit = 400 * 24 * 60; // max iterations
  for (let i = 0; i < limit; i++) {
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const d = candidate.getDate();
    const mo = candidate.getMonth() + 1;
    const dw = candidate.getDay();

    if (
      (minute === null || minute === m) &&
      (hour === null || hour === h) &&
      (dom === null || dom === d) &&
      (month === null || month === mo) &&
      (dow === null || dow === dw)
    ) {
      return candidate;
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback — 24h from now
  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

function parseField(expr: string, _min: number, _max: number): number | null {
  if (expr === '*') return null; // wildcard
  const n = parseInt(expr, 10);
  if (!isNaN(n)) return n;
  return null; // unsupported syntax treated as wildcard
}
