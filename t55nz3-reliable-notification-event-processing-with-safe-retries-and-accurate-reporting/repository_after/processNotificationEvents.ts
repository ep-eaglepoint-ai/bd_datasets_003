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
    reason: string | undefined;
  }>;
}


const VALID_TRANSITIONS: Record<
  NotificationState["status"],
  NotificationState["status"][]
> = {
  NONE: ["SENT", "DELIVERED"], 
  SENT: ["DELIVERED"],
  DELIVERED: ["ACKED"],
  ACKED: [],
};


function canTransition(
  from: NotificationState["status"],
  to: NotificationState["status"]
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function processNotificationEvents(
  events: NotificationEvent[]
): {
  states: Record<string, NotificationState>;
  report: ProcessingReport;
} {
  const states: Record<string, NotificationState> = {};
  const seenEventIds = new Set<string>();

  const report: ProcessingReport = {
    totalInputEvents: events.length,
    applied: 0,
    duplicates: 0,
    rejected: {},
    eventsProcessed: [],
  };

  for (const [index, ev] of events.entries()) {
    const entry = {
      eventIndex: index,
      eventId: ev.eventId,
      notificationId: ev.notificationId,
      type: ev.type,
      timestamp: ev.timestamp,
      outcome: "rejected" as ProcessingOutcome,
      reason: undefined as string | undefined,
    };

   
    if (!ev.notificationId?.trim()) {
      entry.reason = "missing or empty notificationId";
      report.rejected.missing_or_empty_notificationId =
        (report.rejected.missing_or_empty_notificationId || 0) + 1;
      report.eventsProcessed.push(entry);
      continue;
    }

    if (seenEventIds.has(ev.eventId)) {
      entry.outcome = "duplicate";
      report.duplicates++;
      report.eventsProcessed.push(entry);
      continue;
    }
    seenEventIds.add(ev.eventId);

   
    if (!["SENT", "DELIVERED", "ACKED"].includes(ev.type)) {
      entry.reason = "invalid event type";
      report.rejected.invalid_event_type =
        (report.rejected.invalid_event_type || 0) + 1;
      report.eventsProcessed.push(entry);
      continue;
    }

    const currentState: NotificationState =
      states[ev.notificationId] ?? {
        status: "NONE",
        lastSeenAt: 0,
        ackCount: 0,
      };


    if (currentState.status === "ACKED") {
      entry.reason = "already ACKED (terminal state)";
      report.rejected.terminal_state_ACKED =
        (report.rejected.terminal_state_ACKED || 0) + 1;
      report.eventsProcessed.push(entry);
      continue;
    }


    if (!canTransition(currentState.status, ev.type)) {
      const label = `invalid_transition_${currentState.status}_to_${ev.type}`;
      entry.reason = `cannot transition from ${currentState.status} to ${ev.type}`;
      report.rejected[label] = (report.rejected[label] || 0) + 1;
      report.eventsProcessed.push(entry);
      continue;
    }

    if (ev.timestamp < currentState.lastSeenAt) {
      entry.reason = "timestamp older than lastSeenAt";
      report.rejected.timestamp_regression =
        (report.rejected.timestamp_regression || 0) + 1;
      report.eventsProcessed.push(entry);
      continue;
    }

 
    states[ev.notificationId] = {
      status: ev.type,
      lastSeenAt: ev.timestamp,
      ackCount:
        ev.type === "ACKED"
          ? currentState.ackCount + 1
          : currentState.ackCount,
    };

    report.applied++;
    entry.outcome = "applied";
    report.eventsProcessed.push(entry);
  }

  return { states, report };
}
