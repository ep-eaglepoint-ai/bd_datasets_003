import { Client } from 'pg';

export function getUserById(client: Client, userId: string): Promise<{ id: string; name: string; email: string; created_at: Date } | null> {
  return client
    .query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [userId]
    )
    .then((res) => (res.rows[0] ?? null));
}

export function getActiveUserIds(client: Client): Promise<Array<{ id: string }>> {
  return client
    .query(
      "SELECT id FROM users WHERE status = 'active' ORDER BY id"
    )
    .then((res) => res.rows);
}
