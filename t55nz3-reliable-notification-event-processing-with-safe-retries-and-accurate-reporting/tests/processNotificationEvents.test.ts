import { processNotificationEvents, NotificationEvent } from '../repository_after/processNotificationEvents';

describe('processNotificationEvents', () => {
  const baseEvent: NotificationEvent = {
    eventId: 'evt-1',
    recipientId: 'user-1',
    notificationId: 'notif-100',
    timestamp: 1000,
    type: 'SENT',
  };

  it('should apply a valid sequence of events', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'DELIVERED', timestamp: 1100 },
      { ...baseEvent, eventId: 'e3', type: 'ACKED', timestamp: 1200 },
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100'].status).toBe('ACKED');
    expect(report.applied).toBe(3);
    expect(report.eventsProcessed[2].outcome).toBe('applied');
  });

  it('should reject invalid transitions (e.g., SENT after DELIVERED)', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'DELIVERED', timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'SENT', timestamp: 1100 },
    ];

    const { report } = processNotificationEvents(events);

    expect(report.applied).toBe(1);
    expect(report.rejected['invalid_transition_DELIVERED_to_SENT']).toBe(1);
  });

  it('should identify duplicate event IDs', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'same-id', type: 'SENT' },
      { ...baseEvent, eventId: 'same-id', type: 'DELIVERED' },
    ];

    const { report } = processNotificationEvents(events);

    expect(report.duplicates).toBe(1);
    expect(report.eventsProcessed[1].outcome).toBe('duplicate');
  });

  it('should enforce terminal state (ACKED)', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'ACKED' },
      { ...baseEvent, eventId: 'e2', type: 'DELIVERED' }, // Should be rejected
    ];

    const { report } = processNotificationEvents(events);

    expect(report.rejected['terminal_state_ACKED']).toBe(1);
  });
});