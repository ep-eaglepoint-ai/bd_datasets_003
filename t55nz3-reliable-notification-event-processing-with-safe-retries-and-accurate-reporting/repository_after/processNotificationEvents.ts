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

  function addRejectedCount(reason: string): void {
    report.rejected[reason] = (report.rejected[reason] || 0) + 1;
  }

  events.forEach((ev, index) => {
    // FIX: Explicitly type the entry so TypeScript knows 'reason' is an optional property
    const entry: ProcessingReport['eventsProcessed'][number] = {
      eventIndex: index,
      eventId: ev.eventId,
      notificationId: ev.notificationId,
      type: ev.type,
      timestamp: ev.timestamp,
      outcome: "rejected",
    };

    // ── Always update lastSeenAt when notificationId is present & non-empty ──
    if (ev.notificationId && ev.notificationId.trim() !== "") {
      if (!states[ev.notificationId]) {
        states[ev.notificationId] = {
          status: "NONE",
          lastSeenAt: ev.timestamp,
          ackCount: 0,
        };
      } else if (ev.timestamp > states[ev.notificationId].lastSeenAt) {
        states[ev.notificationId].lastSeenAt = ev.timestamp;
      }

      // ── Deduplication check ─────────────────────────────────────────────
      if (appliedEventIds.has(ev.eventId)) {
        report.duplicates++;
        entry.outcome = "duplicate";
        report.eventsProcessed.push(entry);
        return;
      }

      // ── Basic validation ────────────────────────────────────────────────
      if (!["SENT", "DELIVERED", "ACKED"].includes(ev.type)) {
        addRejectedCount("invalid_event_type");
        entry.reason = "invalid event type";
        report.eventsProcessed.push(entry);
        return;
      }

      const state = states[ev.notificationId];

      // ── Terminal state protection ───────────────────────────────────────
      if (state.status === "ACKED") {
        addRejectedCount("terminal_state_ACKED");
        entry.reason = "already ACKED (terminal)";
        report.eventsProcessed.push(entry);
        return;
      }

      // ── Forward-only transitions ────────────────────────────────────────
      if (!canTransition(state.status, ev.type)) {
        const reason = `invalid_transition_${state.status}_to_${ev.type}`;
        addRejectedCount(reason);
        entry.reason = `cannot transition ${state.status} → ${ev.type}`;
        report.eventsProcessed.push(entry);
        return;
      }

      // ── Apply the event ─────────────────────────────────────────────────
      appliedEventIds.add(ev.eventId);
      report.applied++;

      if (ev.type === "ACKED") {
        state.ackCount += 1;
      }

      state.status = ev.type;

      entry.outcome = "applied";
      report.eventsProcessed.push(entry);
    } else {
      addRejectedCount("missing_or_empty_notificationId");
      entry.reason = "missing or empty notificationId";
      report.eventsProcessed.push(entry);
    }
  });

  return { states, report };
}