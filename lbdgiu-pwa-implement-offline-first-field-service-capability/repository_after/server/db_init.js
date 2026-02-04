import 'dotenv/config';
import { Pool } from 'pg';

export const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT),
});

const initQuery = `
  CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY,
      technician TEXT NOT NULL,
      location TEXT,
      notes TEXT,
      status TEXT,
      details JSONB,
      last_modified BIGINT NOT NULL
  );

  -- Index for faster lookups during conflict resolution
  CREATE INDEX IF NOT EXISTS idx_reports_last_modified ON reports(last_modified);
`;

const setupDatabase = async () => {
    try {
        console.log('--- Initializing Remote Postgres Database ---');
        const client = await pool.connect();

        await client.query(initQuery);

        console.log('✅ Success: Table "reports" is ready.');
        client.release();
    } catch (err) {
        console.error('❌ Error initializing database:', err.message);
    }
};

setupDatabase();