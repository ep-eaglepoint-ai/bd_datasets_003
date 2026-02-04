import { describe, it, expect } from '@jest/globals';
import { calculateTimeRemaining, formatCountdownDisplay } from '../../repository_after/backend/src/lib/utils';

describe('Time Calculation Utilities', () => {
  describe('calculateTimeRemaining', () => {
    it('should calculate future dates correctly', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + (25 * 60 * 60 * 1000)); // 25 hours from now
      const result = calculateTimeRemaining(futureDate);
      
      expect(result.days).toBe(1);
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(0);
      expect(result.seconds).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('upcoming');
    });

    it('should handle past dates', () => {
      const pastDate = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)); // 3 days ago
      
      const result = calculateTimeRemaining(pastDate);
      
      expect(result.days).toBe(3);
      expect(result.status).toBe('past');
    });

    it('should identify "happening now" status for near future', () => {
      const nearFuture = new Date(Date.now() + (30 * 1000));
      
      const result = calculateTimeRemaining(nearFuture);
      
      expect(result.status).toBe('happening');
    });

    it('should handle exact current time', () => {
      const now = new Date();
      
      const result = calculateTimeRemaining(now);
      
      expect(result.totalSeconds).toBe(0);
      expect(result.status).toBe('past');
    });
  });

  describe('formatCountdownDisplay', () => {
    it('should format upcoming countdown', () => {
      const remaining = {
        days: 2,
        hours: 3,
        minutes: 45,
        seconds: 30,
        totalSeconds: 183930,
        status: 'upcoming' as const,
      };    
      const formatted = formatCountdownDisplay(remaining);
      
      expect(formatted).toBe('2d 3h 45m 30s');
    });

    it('should format past countdown', () => {
      const remaining = {
        days: 5,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        status: 'past' as const,
      };    
      const formatted = formatCountdownDisplay(remaining);
      
      expect(formatted).toBe('5 days ago');
    });

    it('should show "Happening now!" for happening status', () => {
      const remaining = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 45,
        totalSeconds: 45,
        status: 'happening' as const,
      };
      
      const formatted = formatCountdownDisplay(remaining);    
      expect(formatted).toBe('Happening now!');
    });
  });
});