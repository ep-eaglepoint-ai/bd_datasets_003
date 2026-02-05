import { processNotificationEvents, NotificationEvent } from '../repository_after/processNotificationEvents'; // adjust path

describe('processNotificationEvents', () => {
  const baseEvent: NotificationEvent = {
    eventId: 'evt-1',
    recipientId: 'user-1',
    notificationId: 'notif-100',
    timestamp: 1000,
    type: 'SENT',
  };

  it('applies valid increasing sequence', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'DELIVERED', timestamp: 1100 },
      { ...baseEvent, eventId: 'e3', type: 'ACKED', timestamp: 1200 },
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100']).toEqual({
      status: 'ACKED',
      lastSeenAt: 1200,
      ackCount: 1,
    });
    expect(report.applied).toBe(3);
    expect(report.duplicates).toBe(0);
    expect(Object.keys(report.rejected)).toHaveLength(0);
  });

  it('rejects invalid transition (backwards)', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'DELIVERED', timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'SENT', timestamp: 1100 },
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100'].status).toBe('DELIVERED');
    expect(states['notif-100'].lastSeenAt).toBe(1000);
    expect(report.applied).toBe(1);
    expect(report.rejected['invalid_transition_DELIVERED_to_SENT']).toBe(1);
  });

  it('does NOT update lastSeenAt or ackCount on duplicate or rejected events', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, eventId: 'e1', type: 'DELIVERED', timestamp: 5000 }, 
      { ...baseEvent, eventId: 'e2', type: 'ACKED', timestamp: 2000 },     
      { ...baseEvent, eventId: 'e3', type: 'DELIVERED', timestamp: 3000 }, 
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100']).toEqual({
      status: 'DELIVERED',
      lastSeenAt: 3000,
      ackCount: 0,
    });
    expect(report.applied).toBe(2);
    expect(report.duplicates).toBe(1);
    expect(report.rejected['invalid_transition_SENT_to_ACKED']).toBe(1);
  });

  it('rejects ACKED event that comes too early, but allows later correct ACKED', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'ACKED', timestamp: 900 },      
      { ...baseEvent, eventId: 'e3', type: 'DELIVERED', timestamp: 1100 },
      { ...baseEvent, eventId: 'e4', type: 'ACKED', timestamp: 1300 },     
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100']).toEqual({
      status: 'ACKED',
      lastSeenAt: 1300,
      ackCount: 1,
    });
    expect(report.applied).toBe(3);
    expect(report.rejected['invalid_transition_SENT_to_ACKED']).toBe(1);
    expect(report.duplicates).toBe(0);
  });

  it('only increments ackCount on successfully applied ACKED events', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'a1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, eventId: 'a2', type: 'DELIVERED', timestamp: 1100 },
      { ...baseEvent, eventId: 'a3', type: 'ACKED', timestamp: 1200 },
      { ...baseEvent, eventId: 'a4', type: 'ACKED', timestamp: 1300 },    
      { ...baseEvent, eventId: 'a3', type: 'ACKED', timestamp: 1400 },     
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100'].ackCount).toBe(1);
    expect(states['notif-100'].status).toBe('ACKED');
    expect(report.applied).toBe(3);
    expect(report.duplicates).toBe(1);
    expect(report.rejected['terminal_state_ACKED']).toBe(1);
  });

  it('handles missing notificationId gracefully', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, notificationId: '', eventId: 'bad1', type: 'SENT', timestamp: 1000 },
      { ...baseEvent, notificationId: '  ', eventId: 'bad2', type: 'SENT', timestamp: 2000 },
      { ...baseEvent, eventId: 'good', notificationId: 'notif-200', type: 'SENT', timestamp: 3000 },
    ];

    const { states, report } = processNotificationEvents(events);

    expect(Object.keys(states)).toHaveLength(1);
    expect(states['notif-200']).toBeDefined();
    expect(report.rejected['missing_or_empty_notificationId']).toBe(2);
    expect(report.applied).toBe(1);
  });

  it('rejects invalid event types', () => {
    const events: NotificationEvent[] = [
      { ...baseEvent, eventId: 'e1', type: 'OPENED' as any, timestamp: 1000 },
      { ...baseEvent, eventId: 'e2', type: 'SENT', timestamp: 1100 },
    ];

    const { states, report } = processNotificationEvents(events);

    expect(states['notif-100'].status).toBe('SENT');
    expect(report.rejected['invalid_event_type']).toBe(1);
    expect(report.applied).toBe(1);
  });
});