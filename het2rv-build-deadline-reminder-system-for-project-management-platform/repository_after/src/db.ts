import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@db:5432/app',
});

export const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        owner_id INT REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'active'
      );
    `);

    // Reminders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
        trigger_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(task_id, trigger_at)
      );
    `);

    // Index for scheduler polling (include updated_at for zombie check)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_trigger_status_updated ON reminders(trigger_at, status, updated_at);
    `);

    // Index for task status to optimize joins
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    await client.query('COMMIT');
    console.log('Database initialized');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database', error);
    throw error;
  } finally {
    client.release();
  }
};
