export type NotificationEvent = {
  eventId: string;
  recipientId: string;
  notificationId: string;
  timestamp: number;
  type: "SENT" | "DELIVERED" | "ACKED";
};

export type NotificationState = {
  status: "NONE" | "SENT" | "DELIVERED" | "ACKED";
  lastSeenAt: number;
  ackCount: number;
};

export type ProcessingOutcome = "applied" | "duplicate" | "rejected";

export interface ProcessingReport {
  totalInputEvents: number;
  applied: number;
  duplicates: number;
  rejected: Record<string, number>;
  eventsProcessed: Array<{
    eventIndex: number;
    eventId: string;
    notificationId: string;
    type: string;
    timestamp: number;
    outcome: ProcessingOutcome;
    reason?: string;
  }>;
}

const STATUS_ORDER: Record<NotificationState["status"], number> = {
  NONE: 0,
  SENT: 1,
  DELIVERED: 2,
  ACKED: 3,
};


function canTransition(current: NotificationState["status"], next: NotificationState["status"]): boolean {
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}


export function processNotificationEvents(events: NotificationEvent[]): {
  states: Record<string, NotificationState>;
  report: ProcessingReport;
} {
  const states: Record<string, NotificationState> = {};
  const appliedEventIds = new Set<string>();

  const report: ProcessingReport = {
    totalInputEvents: events.length,
    applied: 0,
    duplicates: 0,
    rejected: {},
    eventsProcessed: [],
  };


  const handleRejected = (entry: ProcessingReport['eventsProcessed'][number], reason: string, label: string) => {
    report.rejected[label] = (report.rejected[label] || 0) + 1;
    entry.outcome = "rejected";
    entry.reason = reason;
    report.eventsProcessed.push(entry);
  };

  events.forEach((ev, index) => {
    const entry: ProcessingReport['eventsProcessed'][number] = {
      eventIndex: index,
      eventId: ev.eventId,
      notificationId: ev.notificationId,
      type: ev.type,
      timestamp: ev.timestamp,
      outcome: "applied", 
    };


    if (!ev.notificationId || ev.notificationId.trim() === "") {
      return handleRejected(entry, "missing or empty notificationId", "missing_or_empty_notificationId");
    }


    if (appliedEventIds.has(ev.eventId)) {
      report.duplicates++;
      entry.outcome = "duplicate";
      report.eventsProcessed.push(entry);
      return;
    }

 
    if (!states[ev.notificationId]) {
      states[ev.notificationId] = {
        status: "NONE",
        lastSeenAt: 0,
        ackCount: 0,
      };
    }

    const state = states[ev.notificationId];


    if (!["SENT", "DELIVERED", "ACKED"].includes(ev.type)) {
      return handleRejected(entry, "invalid event type", "invalid_event_type");
    }


    if (state.status === "ACKED") {
      return handleRejected(entry, "already ACKED (terminal)", "terminal_state_ACKED");
    }

 
    if (!canTransition(state.status, ev.type)) {
      const label = `invalid_transition_${state.status}_to_${ev.type}`;
      return handleRejected(entry, `cannot transition ${state.status} → ${ev.type}`, label);
    }


    appliedEventIds.add(ev.eventId);
    report.applied++;

    if (ev.type === "ACKED") {
      state.ackCount += 1;
    }

    state.status = ev.type;
    state.lastSeenAt = Math.max(state.lastSeenAt, ev.timestamp);
    
    entry.outcome = "applied";
    report.eventsProcessed.push(entry);
  });

  return { states, report };
}