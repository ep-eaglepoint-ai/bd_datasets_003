import { describe, it, expect } from 'vitest'
import { formatTime } from '../utils/formatTime'

describe('formatTime', () => {
  describe('Edge cases', () => {
    it('should return "0:00" for zero seconds', () => {
      expect(formatTime(0)).toBe('0:00')
    })

    it('should return "0:00" for negative values', () => {
      expect(formatTime(-1)).toBe('0:00')
      expect(formatTime(-10)).toBe('0:00')
      expect(formatTime(-100)).toBe('0:00')
    })

    it('should return "0:00" for non-finite values', () => {
      expect(formatTime(NaN)).toBe('0:00')
      expect(formatTime(Infinity)).toBe('0:00')
      expect(formatTime(-Infinity)).toBe('0:00')
    })
  })

  describe('Standard time formatting', () => {
    it('should format 59 seconds correctly', () => {
      expect(formatTime(59)).toBe('0:59')
    })

    it('should format 60 seconds (1 minute) correctly', () => {
      expect(formatTime(60)).toBe('1:00')
    })

    it('should format seconds with zero-padded seconds', () => {
      expect(formatTime(1)).toBe('0:01')
      expect(formatTime(5)).toBe('0:05')
      expect(formatTime(9)).toBe('0:09')
    })

    it('should format minutes with two-digit seconds', () => {
      expect(formatTime(65)).toBe('1:05')
      expect(formatTime(125)).toBe('2:05')
      expect(formatTime(185)).toBe('3:05')
    })

    it('should format large values correctly', () => {
      expect(formatTime(3600)).toBe('60:00') // 1 hour
      expect(formatTime(3661)).toBe('61:01') // 1 hour 1 minute 1 second
      expect(formatTime(7200)).toBe('120:00') // 2 hours
      expect(formatTime(86400)).toBe('1440:00') // 24 hours
    })

    it('should format very large numbers correctly', () => {
      expect(formatTime(100000)).toBe('1666:40')
      expect(formatTime(999999)).toBe('16666:39')
    })
  })

  describe('Decimal inputs', () => {
    it('should floor decimal seconds correctly', () => {
      expect(formatTime(59.1)).toBe('0:59')
      expect(formatTime(59.5)).toBe('0:59')
      expect(formatTime(59.9)).toBe('0:59')
      expect(formatTime(60.5)).toBe('1:00')
      expect(formatTime(65.7)).toBe('1:05')
    })
  })

  describe('Zero-padding', () => {
    it('should always pad seconds to two digits', () => {
      expect(formatTime(600)).toBe('10:00')
      expect(formatTime(601)).toBe('10:01')
      expect(formatTime(609)).toBe('10:09')
      expect(formatTime(610)).toBe('10:10')
    })
  })
})
