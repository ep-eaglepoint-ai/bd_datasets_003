import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { AppError, ErrorCodes } from "./utils/AppError";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root", // pg defaults to postgres usually, but keeping legacy default could be risky if env not set.
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "payments",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  max: 10,
});

export async function query<T extends QueryResultRow>(
  text: string,
  params: any[] = [],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (err: any) {
    throw new AppError("Database query failed", ErrorCodes.DB_ERROR, err);
  }
}

export async function getClient(): Promise<PoolClient> {
  try {
    return await pool.connect();
  } catch (err: any) {
    throw new AppError("Failed to acquire client", ErrorCodes.DB_ERROR, err);
  }
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error: any) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Log rollback failure if needed, but primary error is the one to return
      console.error("Rollback failed:", rollbackError);
    }
    // If it's already an AppError, rethrow. Otherwise wrap.
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Transaction failed", ErrorCodes.DB_ERROR, error);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
