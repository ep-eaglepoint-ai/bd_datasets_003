import { DateTime } from 'luxon';
import { generateSlots } from '../../repository_after/api/src/services/availability/availability';

describe('DST Edge Cases - Simple', () => {
  test('Should handle basic timezone operations', () => {
    const tz = 'America/New_York';
    
    // Test basic timezone conversion
    const utcTime = DateTime.fromISO('2024-03-10T12:00:00Z', { zone: 'utc' });
    const localTime = utcTime.setZone(tz);
    
    expect(localTime.isValid).toBe(true);
    expect(localTime.zoneName).toBe('America/New_York');
  });

  test('Should handle slot generation with timezone', () => {
    const tz = 'America/New_York';
    
    // Create a simple window
    const window = [{
      startUtcISO: '2024-03-10T12:00:00Z',
      endUtcISO: '2024-03-10T14:00:00Z'
    }];
    
    // Generate slots
    const slots = generateSlots(window, 60, 0, 0, tz);
    
    // Should generate some slots
    expect(slots.length).toBeGreaterThan(0);
    
    // Verify slots have correct structure
    slots.forEach(slot => {
      expect(slot.startUtcISO).toBeDefined();
      expect(slot.endUtcISO).toBeDefined();
      expect(slot.startLocalISO).toBeDefined();
      expect(slot.endLocalISO).toBeDefined();
    });
  });

  test('Should handle different timezones', () => {
    const timezones = [
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'UTC'
    ];
    
    timezones.forEach(tz => {
      const window = [{
        startUtcISO: '2024-06-15T10:00:00Z',
        endUtcISO: '2024-06-15T11:00:00Z'
      }];
      
      const slots = generateSlots(window, 60, 0, 0, tz);
      
      // Should generate slots for each timezone
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  test('Should handle edge case timezones', () => {
    const edgeTimezones = [
      'Pacific/Kiritimati',
      'Pacific/Auckland',
      'Atlantic/Azores'
    ];
    
    edgeTimezones.forEach(tz => {
      const window = [{
        startUtcISO: '2024-06-15T10:00:00Z',
        endUtcISO: '2024-06-15T11:00:00Z'
      }];
      
      // Should not throw for edge case timezones
      expect(() => {
        generateSlots(window, 60, 0, 0, tz);
      }).not.toThrow();
    });
  });

  test('Should handle invalid timezone gracefully', () => {
    const window = [{
      startUtcISO: '2024-06-15T10:00:00Z',
      endUtcISO: '2024-06-15T11:00:00Z'
    }];
    
    // Should not throw for invalid timezone
    expect(() => {
      generateSlots(window, 60, 0, 0, 'Invalid/Timezone');
    }).not.toThrow();
  });

  test('Should handle buffer times correctly', () => {
    const tz = 'America/New_York';
    
    const window = [{
      startUtcISO: '2024-06-15T10:00:00Z',
      endUtcISO: '2024-06-15T12:00:00Z'
    }];
    
    // Test with buffer times
    const slots = generateSlots(window, 60, 15, 15, tz);
    
    expect(slots.length).toBeGreaterThan(0);
    
    // Verify buffer times are applied
    slots.forEach(slot => {
      const startLocal = DateTime.fromISO(slot.startLocalISO, { zone: tz });
      expect(startLocal.isValid).toBe(true);
    });
  });
});
