// filename: data-service.ts

/**
 * Database Driver Mock
 * provides simulated asynchronous IO with a fixed latency.
 * side-effects: increments a global counter to track physical DB hits.
 */
export interface DatabaseResponse {
  id: string;
  content: string;
  version: number;
}

export class DatabaseDriver {
  private callCount: number = 0;

  async fetchFromDisk(id: string): Promise<DatabaseResponse> {
    this.callCount++;
    // Simulate network and disk latency
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (id === 'error-trigger') {
      throw new Error('Database connection timeout');
    }

    return {
      id,
      content: 'High-fidelity production data',
      version: Math.floor(Math.random() * 1000)
    };
  }

  getHitCount(): number {
    return this.callCount;
  }
}

/**
 * LegacyDataService
 * Current implementation: Lacks collapsing logic.
 * Every call to getArticle results in a call to the database.
 */
export class LegacyDataService {
  private db: DatabaseDriver;

  constructor(db: DatabaseDriver) {
    this.db = db;
  }

  // This method needs to be optimized to collapse concurrent requests
  async getArticle(id: string): Promise<DatabaseResponse> {
    return await this.db.fetchFromDisk(id);
  }
}