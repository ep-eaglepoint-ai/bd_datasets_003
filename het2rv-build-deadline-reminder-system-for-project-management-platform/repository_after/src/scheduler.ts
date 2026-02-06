import { pool } from "./db";

const DEFAULT_POLL_INTERVAL_MS = 10000;
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
let isRunning = false;
let stopSignal = false;

// Recursive scheduler to prevent overlap
const scheduleNextRun = () => {
  if (stopSignal) {
    isRunning = false;
    console.log("Scheduler stopped.");
    return;
  }

  setTimeout(async () => {
    await processReminders();
    scheduleNextRun();
  }, pollIntervalMs);
};

export const startScheduler = (opts?: {
  pollIntervalMs?: number;
  runImmediately?: boolean;
}) => {
  if (isRunning) return;
  isRunning = true;
  stopSignal = false;
  pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  console.log("Starting scheduler worker...");

  if (opts?.runImmediately) {
    void processReminders();
  }
  scheduleNextRun();
};

export const stopScheduler = () => {
  stopSignal = true;
};

export type ReminderRow = { id: number; task_id: number; trigger_at: string };

export const processReminders = async (opts?: {
  batchSize?: number;
  notify?: (reminder: ReminderRow) => Promise<void>;
}) => {
  const client = await pool.connect();
  let remindersToProcess: ReminderRow[] = [];
  const batchSize = Math.max(1, Math.min(1000, opts?.batchSize ?? 100));
  const notify =
    opts?.notify ??
    (async (reminder: ReminderRow) => {
      console.log(
        `[NOTIFICATION SENT] Task: ${
          reminder.task_id
        }, Time: ${new Date().toISOString()}`
      );
    });

  try {
    await client.query("BEGIN");

    // FETCH BATCH
    // Uses SKIP LOCKED to allow multiple worker instances if needed
    // Zombie check: picks up 'processing' items older than 5 mins
    const query = `
      UPDATE reminders
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT r.id
        FROM reminders r
        JOIN tasks t ON r.task_id = t.id
        WHERE (
            r.status = 'pending'
            OR (r.status = 'processing' AND r.updated_at < NOW() - INTERVAL '5 minutes')
        )
        AND r.trigger_at <= NOW()
        AND t.status = 'active'
        AND (t.deadline IS NULL OR t.deadline >= NOW())
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING id, task_id, trigger_at;
    `;

    const result = await client.query(query);
    remindersToProcess = result.rows;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Scheduler DB Error:", error);
    client.release();
    return;
  }

  client.release();

  if (remindersToProcess.length === 0) return;

  console.log(
    `[Scheduler] Processing batch of ${remindersToProcess.length} reminders...`
  );

  // PROCESS BATCH
  // We use Promise.allSettled to ensure one failure doesn't crash the whole batch.
  await Promise.allSettled(
    remindersToProcess.map(async (reminder) => {
      try {
        await notify(reminder);

        // Mark as processed only on success
        await pool.query(
          `
        UPDATE reminders
        SET status = 'processed', updated_at = NOW()
        WHERE id = $1
      `,
          [reminder.id]
        );
      } catch (err) {
        console.error(`Failed to send reminder ${reminder.id}`, err);
        // We do NOT update status here.
        // It stays 'processing' and 'updated_at' gets old.
        // The Zombie logic in the SELECT query will pick it up again in 5 minutes.
      }
    })
  );
};
