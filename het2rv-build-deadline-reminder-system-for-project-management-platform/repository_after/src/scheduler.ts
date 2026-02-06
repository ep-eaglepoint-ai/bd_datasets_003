import { pool } from './db';

const PROCESS_INTERVAL_MS = 10000; // Check every 10 seconds
let schedulerInterval: NodeJS.Timeout | null = null;

export const startScheduler = () => {
  if (schedulerInterval) return;
  console.log('Starting scheduler...');
  schedulerInterval = setInterval(processReminders, PROCESS_INTERVAL_MS);
};

export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

export const processReminders = async () => {
  const client = await pool.connect();
  let remindersToProcess: any[] = [];

  try {
    // 1. Atomically pick a batch and mark as 'processing'
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE reminders
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT r.id
        FROM reminders r
        JOIN tasks t ON r.task_id = t.id
        WHERE (r.status = 'pending' OR (r.status = 'processing' AND r.updated_at < NOW() - INTERVAL '5 minutes'))
          AND r.trigger_at <= NOW()
          AND t.status = 'active'
        FOR UPDATE SKIP LOCKED
        LIMIT 100
      )
      RETURNING id, task_id, trigger_at;
    `);

    remindersToProcess = result.rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fetching reminders batch', error);
    client.release();
    return;
  }

  client.release(); // Release connection to pool while we process I/O

  if (remindersToProcess.length === 0) return;

  console.log(`Processing batch of ${remindersToProcess.length} reminders...`);

  // 2. Process the batch in PARALLEL
  await Promise.allSettled(remindersToProcess.map(async (reminder) => {
    try {
      // Send notification (Mock logic)
      console.log(`[NOTIFICATION] Reminder for Task ID ${reminder.task_id} at ${new Date().toISOString()}`);

      // Mark as processed
      await pool.query(`
        UPDATE reminders
        SET status = 'processed', updated_at = NOW()
        WHERE id = $1
      `, [reminder.id]);
    } catch (err) {
      console.error(`Failed to process reminder ${reminder.id}`, err);
      // We don't mark as 'failed' immediately, allowing Zombie logic to retry it later
    }
  }));
};
