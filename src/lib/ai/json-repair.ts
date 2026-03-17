/**
 * JSON repair utilities for local model output
 *
 * Local models sometimes wrap JSON in markdown fences or produce
 * trailing commas. This module cleans up common issues before parsing.
 */

export function repairJson(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Strip leading text before first { or [
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const start = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity
  );
  if (start !== Infinity && start > 0) {
    cleaned = cleaned.slice(start);
  }

  // Strip trailing text after last } or ]
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end >= 0 && end < cleaned.length - 1) {
    cleaned = cleaned.slice(0, end + 1);
  }

  // Fix trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned;
}

export function safeJsonParse(raw: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch { /* continue to repair */ }

  // Try repaired
  try {
    return JSON.parse(repairJson(raw));
  } catch {
    return null;
  }
}
