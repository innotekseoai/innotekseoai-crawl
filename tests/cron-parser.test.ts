import { describe, it, expect } from 'vitest';
import { nextRunDate } from '../src/lib/scheduler/cron-parser';

describe('cron-parser', () => {
  const now = new Date('2026-03-18T10:00:00Z');

  describe('named frequencies', () => {
    it('daily returns next day at 3am', () => {
      const next = nextRunDate('daily', now);
      expect(next.getDate()).toBe(19);
      expect(next.getHours()).toBe(3);
      expect(next.getMinutes()).toBe(0);
    });

    it('weekly returns 7 days later at 3am', () => {
      const next = nextRunDate('weekly', now);
      expect(next.getDate()).toBe(25);
      expect(next.getHours()).toBe(3);
    });

    it('monthly returns next month at 3am', () => {
      const next = nextRunDate('monthly', now);
      expect(next.getMonth()).toBe(3); // April (0-indexed)
      expect(next.getHours()).toBe(3);
    });

    it('handles case insensitivity', () => {
      const next = nextRunDate('Daily', now);
      expect(next.getDate()).toBe(19);
    });
  });

  describe('cron expressions', () => {
    it('parses "0 3 * * *" (daily at 3am)', () => {
      const next = nextRunDate('0 3 * * *', now);
      expect(next.getHours()).toBe(3);
      expect(next.getMinutes()).toBe(0);
      // Should be next day since 10am > 3am
      expect(next.getDate()).toBe(19);
    });

    it('parses "30 14 * * *" (daily at 2:30pm)', () => {
      const next = nextRunDate('30 14 * * *', now);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
      // Same day since 10am < 2:30pm
      expect(next.getDate()).toBe(18);
    });

    it('parses "0 0 1 * *" (first of month at midnight)', () => {
      const next = nextRunDate('0 0 1 * *', now);
      expect(next.getDate()).toBe(1);
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(0);
    });

    it('throws on invalid expression', () => {
      expect(() => nextRunDate('invalid cron')).toThrow('Invalid cron expression');
    });
  });
});
