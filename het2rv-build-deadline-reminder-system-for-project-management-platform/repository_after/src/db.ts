// import { Pool } from 'pg';

// export const pool = new Pool({
//   connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@db:5432/app',
// });

// export const initDB = async () => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');

//     // Users table
//     await client.query(`
//       CREATE TABLE IF NOT EXISTS users (
//         id SERIAL PRIMARY KEY,
//         name TEXT NOT NULL
//       );
//     `);

//     // Tasks table
//     await client.query(`
//       CREATE TABLE IF NOT EXISTS tasks (
//         id SERIAL PRIMARY KEY,
//         title TEXT NOT NULL,
//         owner_id INT REFERENCES users(id),
//         status TEXT NOT NULL DEFAULT 'active',
//         deadline TIMESTAMPTZ
//       );
//     `);

//     // Ensure deadline column exists (migration-like behavior)
//     try {
//         await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;`);
//     } catch (e) {
//         // Ignore if error, likely already exists or other issue we can't solve easily here
//         console.warn('Could not alter table tasks to add deadline', e);
//     }

//     // Reminders table
//     await client.query(`
//       CREATE TABLE IF NOT EXISTS reminders (
//         id SERIAL PRIMARY KEY,
//         task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
//         trigger_at TIMESTAMPTZ NOT NULL,
//         status TEXT NOT NULL DEFAULT 'pending',
//         created_at TIMESTAMPTZ DEFAULT NOW(),
//         updated_at TIMESTAMPTZ DEFAULT NOW(),
//         UNIQUE(task_id, trigger_at)
//       );
//     `);

//     // Index for scheduler polling (include updated_at for zombie check)
//     await client.query(`
//       CREATE INDEX IF NOT EXISTS idx_reminders_trigger_status_updated ON reminders(trigger_at, status, updated_at);
//     `);

//     // Index for task status to optimize joins
//     await client.query(`
//       CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
//     `);

//     await client.query('COMMIT');
//     console.log('Database initialized');
//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Failed to initialize database', error);
//     throw error;
//   } finally {
//     client.release();
//   }
// };


import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@db:5432/app',
  // Production optimization: connection limits
  max: 20,
  idleTimeoutMillis: 30000,
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

    // Tasks table: Added deadline
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        owner_id INT REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'active',
        deadline TIMESTAMPTZ
      );
    `);

    // Migration compatibility: Ensure deadline exists if table was already there
    try {
        await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;`);
    } catch (e) {
        console.warn('Note: deadline column check skipped', e);
    }

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

    // Optimized Index for Scheduler (Priority: Trigger Time -> Status -> Zombie Check)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_polling
      ON reminders(trigger_at, status, updated_at);
    `);

    // Index for Task Status (for Join performance)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CRITICAL: Failed to initialize database', error);
    throw error;
  } finally {
    client.release();
  }
};