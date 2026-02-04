import type { Pool, PoolClient, QueryResult } from "pg";

type Queryable = {
  query: (text: string, params?: any[]) => Promise<QueryResult<any>>;
};

function normalizeCommand(text: string): string {
  return text.trim().toUpperCase();
}

export type TransactionalPool = Pool & {
  __tx: {
    rollback: () => Promise<void>;
    release: () => void;
  };
};

export async function createTransactionalPool(
  basePool: Pool
): Promise<TransactionalPool> {
  const rootClient = await basePool.connect();
  let savepointDepth = 0;
  let released = false;

  await rootClient.query("BEGIN");

  const wrapQuery = async (client: Queryable, text: string, params?: any[]) => {
    const cmd = normalizeCommand(text);
    if (cmd === "BEGIN") {
      savepointDepth += 1;
      return client.query(`SAVEPOINT sp_${savepointDepth}`);
    }
    if (cmd === "COMMIT") {
      if (savepointDepth > 0) {
        const depth = savepointDepth;
        savepointDepth -= 1;
        return client.query(`RELEASE SAVEPOINT sp_${depth}`);
      }
      return client.query("COMMIT");
    }
    if (cmd === "ROLLBACK") {
      if (savepointDepth > 0) {
        const depth = savepointDepth;
        savepointDepth -= 1;
        return client.query(`ROLLBACK TO SAVEPOINT sp_${depth}`);
      }
      return client.query("ROLLBACK");
    }
    return client.query(text, params);
  };

  const connect = async (): Promise<PoolClient> => {
    const nestedClient: any = {
      query: (text: string, params?: any[]) =>
        wrapQuery(rootClient, text, params),
      release: () => {
        // no-op: released once after the test
      },
    };
    return nestedClient as PoolClient;
  };

  const txPool: any = {
    query: (text: string, params?: any[]) =>
      wrapQuery(rootClient, text, params),
    connect,
    end: async () => {
      // no-op; base pool is owned by the test file
    },
    __tx: {
      rollback: async () => {
        // Always roll back the root transaction regardless of nested savepoints.
        try {
          await rootClient.query("ROLLBACK");
        } finally {
          savepointDepth = 0;
        }
      },
      release: () => {
        if (released) return;
        released = true;
        try {
          rootClient.release();
        } catch {
          // Ignore double-release; can happen after test timeouts.
        }
      },
    },
  };

  return txPool as TransactionalPool;
}
