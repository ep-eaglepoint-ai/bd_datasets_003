import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { requireEnv } from "./env";

let schemaApplied = false;

export function createBasePool(): Pool {
  return new Pool({
    host: requireEnv("PGHOST", "localhost"),
    port: parseInt(requireEnv("PGPORT", "5432"), 10),
    user: requireEnv("PGUSER", "postgres"),
    password: requireEnv("PGPASSWORD", "postgres"),
    database: requireEnv("PGDATABASE", "testdb"),
    max: 5,
    allowExitOnIdle: true,
  });
}

export async function applySchemaOnce(pool: Pool): Promise<void> {
  if (schemaApplied) return;

  const existing = await pool.query(
    "SELECT to_regclass('public.orders') AS orders, to_regclass('public.inventory') AS inventory, to_regclass('public.refunds') AS refunds"
  );
  const row = existing.rows[0] as {
    orders: string | null;
    inventory: string | null;
    refunds: string | null;
  };
  const hasOrders = !!row?.orders;
  const hasInventory = !!row?.inventory;
  const hasRefunds = !!row?.refunds;

  if (hasOrders && hasInventory && hasRefunds) {
    schemaApplied = true;
    return;
  }

  // If the schema is partially present (e.g. a previous run died mid-apply), reset it.
  if (hasOrders || hasInventory || hasRefunds) {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
  }

  const schemaPath = path.resolve(
    __dirname,
    "../../repository_before/schema.sql"
  );
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  schemaApplied = true;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE refunds RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE TABLE inventory RESTART IDENTITY CASCADE");
}
