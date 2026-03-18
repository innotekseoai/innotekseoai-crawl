/**
 * Structured request logging
 *
 * Logs API calls as JSON to stdout for monitoring.
 * Integrated into withAuth wrapper.
 */

export interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userAgent?: string;
  timestamp: string;
}

export function logRequest(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry));
}
