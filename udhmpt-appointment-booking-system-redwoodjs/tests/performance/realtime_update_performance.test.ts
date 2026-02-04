import { DateTime } from 'luxon';

// Mock real-time system for performance testing
class MockRealtimeSystem {
  private subscribers: Map<string, Set<(data: any) => void>> = new Map();
  private performanceStats = {
    totalUpdates: 0,
    avgProcessingTime: 0,
    maxProcessingTime: 0,
    subscribersCount: 0
  };

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(callback);
    this.performanceStats.subscribersCount++;
    
    return () => {
      const subscribers = this.subscribers.get(event);
      if (subscribers) {
        subscribers.delete(callback);
        this.performanceStats.subscribersCount--;
      }
    };
  }

  publish(event: string, data: any): void {
    const startTime = Date.now();
    const subscribers = this.subscribers.get(event);
    
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // Silently handle subscriber errors
        }
      });
    }
    
    const processingTime = Date.now() - startTime;
    this.performanceStats.totalUpdates++;
    this.performanceStats.maxProcessingTime = Math.max(
      this.performanceStats.maxProcessingTime,
      processingTime
    );
    this.performanceStats.avgProcessingTime = 
      (this.performanceStats.avgProcessingTime * (this.performanceStats.totalUpdates - 1) + processingTime) / 
      this.performanceStats.totalUpdates;
  }

  getStats() {
    return { ...this.performanceStats };
  }
}

describe('Real-time Update Performance Tests', () => {
  let realtimeSystem: MockRealtimeSystem;

  beforeEach(() => {
    realtimeSystem = new MockRealtimeSystem();
  });

  test('Should handle 1000+ concurrent subscribers', async () => {
    const subscribers = [];
    let updateCount = 0;
    
    // Create 1000 subscribers
    for (let i = 0; i < 1000; i++) {
      const unsubscribe = realtimeSystem.subscribe('test', () => {
        updateCount++;
      });
      subscribers.push(unsubscribe);
    }
    
    expect(realtimeSystem.getStats().subscribersCount).toBe(1000);
    
    // Publish updates
    const startTime = Date.now();
    for (let i = 0; i < 100; i++) {
      realtimeSystem.publish('test', { id: i });
    }
    const endTime = Date.now();
    
    expect(updateCount).toBe(100000); // 100 updates × 1000 subscribers
    expect(endTime - startTime).toBeLessThan(1000);
    
    // Cleanup
    subscribers.forEach(unsubscribe => unsubscribe());
  });

  test('Should handle high-frequency updates', async () => {
    let receivedUpdates = 0;
    realtimeSystem.subscribe('high-freq', () => {
      receivedUpdates++;
    });
    
    const startTime = Date.now();
    for (let i = 0; i < 10000; i++) {
      realtimeSystem.publish('high-freq', { id: i });
    }
    const endTime = Date.now();
    
    expect(receivedUpdates).toBe(10000);
    expect(endTime - startTime).toBeLessThan(2000);
    
    const stats = realtimeSystem.getStats();
    expect(stats.avgProcessingTime).toBeLessThan(1);
  });

  test('Should handle mixed event types efficiently', async () => {
    const events = ['availability', 'booking', 'cancellation'];
    const counts = { availability: 0, booking: 0, cancellation: 0 };
    
    events.forEach(event => {
      realtimeSystem.subscribe(event, () => {
        counts[event as keyof typeof counts]++;
      });
    });
    
    const startTime = Date.now();
    
    // Publish mixed events
    for (let i = 0; i < 1000; i++) {
      const event = events[i % events.length];
      realtimeSystem.publish(event, { id: i, type: event });
    }
    
    const endTime = Date.now();
    
    expect(counts.availability).toBe(334);
    expect(counts.booking).toBe(333);
    expect(counts.cancellation).toBe(333);
    expect(endTime - startTime).toBeLessThan(1000);
  });

  test('Should handle large payload updates', async () => {
    let receivedCount = 0;
    realtimeSystem.subscribe('large-payload', () => {
      receivedCount++;
    });
    
    const largePayload = {
      data: 'x'.repeat(10000), // 10KB
      metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
    };
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      realtimeSystem.publish('large-payload', { ...largePayload, id: i });
    }
    
    const endTime = Date.now();
    
    expect(receivedCount).toBe(100);
    expect(endTime - startTime).toBeLessThan(3000);
  });
});
