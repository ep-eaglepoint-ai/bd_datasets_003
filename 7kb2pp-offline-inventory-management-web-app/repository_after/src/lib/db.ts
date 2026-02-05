import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { 
  InventoryItem, 
  Category, 
  Location, 
  StockMovement, 
  AuditLog,
  ValuationSnapshot,
  InventoryItemSchema,
  CategorySchema,
  LocationSchema,
  StockMovementSchema,
  AuditLogSchema,
  ValuationSnapshotSchema,
} from './schemas';

const DB_NAME = 'inventory-management-db';
const DB_VERSION = 1;

interface InventoryDB extends DBSchema {
  items: {
    key: string;
    value: InventoryItem;
    indexes: { 'by-sku': string; 'by-category': string; 'by-location': string };
  };
  categories: {
    key: string;
    value: Category;
    indexes: { 'by-name': string };
  };
  locations: {
    key: string;
    value: Location;
    indexes: { 'by-name': string };
  };
  movements: {
    key: string;
    value: StockMovement;
    indexes: { 'by-item': string; 'by-timestamp': string };
  };
  auditLogs: {
    key: string;
    value: AuditLog;
    indexes: { 'by-entity': string; 'by-timestamp': string };
  };
  valuationSnapshots: {
    key: string;
    value: ValuationSnapshot;
    indexes: { 'by-timestamp': string };
  };
}

let dbInstance: IDBPDatabase<InventoryDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<InventoryDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<InventoryDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Items store
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('by-sku', 'sku', { unique: true });
        itemStore.createIndex('by-category', 'categoryId');
        itemStore.createIndex('by-location', 'locationId');
      }

      // Categories store
      if (!db.objectStoreNames.contains('categories')) {
        const categoryStore = db.createObjectStore('categories', { keyPath: 'id' });
        categoryStore.createIndex('by-name', 'name');
      }

      // Locations store
      if (!db.objectStoreNames.contains('locations')) {
        const locationStore = db.createObjectStore('locations', { keyPath: 'id' });
        locationStore.createIndex('by-name', 'name');
      }

      // Movements store (immutable log)
      if (!db.objectStoreNames.contains('movements')) {
        const movementStore = db.createObjectStore('movements', { keyPath: 'id' });
        movementStore.createIndex('by-item', 'itemId');
        movementStore.createIndex('by-timestamp', 'timestamp');
      }

      // Audit logs store (immutable)
      if (!db.objectStoreNames.contains('auditLogs')) {
        const auditStore = db.createObjectStore('auditLogs', { keyPath: 'id' });
        auditStore.createIndex('by-entity', 'entityId');
        auditStore.createIndex('by-timestamp', 'timestamp');
      }

      // Valuation snapshots store
      if (!db.objectStoreNames.contains('valuationSnapshots')) {
        const valuationStore = db.createObjectStore('valuationSnapshots', { keyPath: 'id' });
        valuationStore.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

// Database operations with validation
export const db = {
  // Items
  async getAllItems(): Promise<InventoryItem[]> {
    const database = await getDB();
    const items = await database.getAll('items');
    return items.map(item => InventoryItemSchema.parse(item));
  },

  async getItem(id: string): Promise<InventoryItem | undefined> {
    const database = await getDB();
    const item = await database.get('items', id);
    return item ? InventoryItemSchema.parse(item) : undefined;
  },

  async getItemBySku(sku: string): Promise<InventoryItem | undefined> {
    const database = await getDB();
    const item = await database.getFromIndex('items', 'by-sku', sku);
    return item ? InventoryItemSchema.parse(item) : undefined;
  },

  async saveItem(item: InventoryItem): Promise<void> {
    const validated = InventoryItemSchema.parse(item);
    const database = await getDB();
    await database.put('items', validated);
  },

  async deleteItem(id: string): Promise<void> {
    const database = await getDB();
    await database.delete('items', id);
  },

  // Categories
  async getAllCategories(): Promise<Category[]> {
    const database = await getDB();
    const categories = await database.getAll('categories');
    return categories.map(cat => CategorySchema.parse(cat));
  },

  async getCategory(id: string): Promise<Category | undefined> {
    const database = await getDB();
    const category = await database.get('categories', id);
    return category ? CategorySchema.parse(category) : undefined;
  },

  async saveCategory(category: Category): Promise<void> {
    const validated = CategorySchema.parse(category);
    const database = await getDB();
    await database.put('categories', validated);
  },

  async deleteCategory(id: string): Promise<void> {
    const database = await getDB();
    await database.delete('categories', id);
  },

  // Locations
  async getAllLocations(): Promise<Location[]> {
    const database = await getDB();
    const locations = await database.getAll('locations');
    return locations.map(loc => LocationSchema.parse(loc));
  },

  async getLocation(id: string): Promise<Location | undefined> {
    const database = await getDB();
    const location = await database.get('locations', id);
    return location ? LocationSchema.parse(location) : undefined;
  },

  async saveLocation(location: Location): Promise<void> {
    const validated = LocationSchema.parse(location);
    const database = await getDB();
    await database.put('locations', validated);
  },

  async deleteLocation(id: string): Promise<void> {
    const database = await getDB();
    await database.delete('locations', id);
  },

  // Movements (immutable - only add, never update or delete)
  async getAllMovements(): Promise<StockMovement[]> {
    const database = await getDB();
    const movements = await database.getAll('movements');
    return movements.map(mov => StockMovementSchema.parse(mov));
  },

  async getMovementsByItem(itemId: string): Promise<StockMovement[]> {
    const database = await getDB();
    const movements = await database.getAllFromIndex('movements', 'by-item', itemId);
    return movements.map(mov => StockMovementSchema.parse(mov));
  },

  async addMovement(movement: StockMovement): Promise<void> {
    const validated = StockMovementSchema.parse(movement);
    const database = await getDB();
    await database.add('movements', validated);
  },

  // Audit logs (immutable)
  async getAllAuditLogs(): Promise<AuditLog[]> {
    const database = await getDB();
    const logs = await database.getAll('auditLogs');
    return logs.map(log => AuditLogSchema.parse(log));
  },

  async getAuditLogsByEntity(entityId: string): Promise<AuditLog[]> {
    const database = await getDB();
    const logs = await database.getAllFromIndex('auditLogs', 'by-entity', entityId);
    return logs.map(log => AuditLogSchema.parse(log));
  },

  async addAuditLog(log: AuditLog): Promise<void> {
    const validated = AuditLogSchema.parse(log);
    const database = await getDB();
    await database.add('auditLogs', validated);
  },

  // Valuation snapshots
  async getAllValuationSnapshots(): Promise<ValuationSnapshot[]> {
    const database = await getDB();
    const snapshots = await database.getAll('valuationSnapshots');
    return snapshots.map(snap => ValuationSnapshotSchema.parse(snap));
  },

  async addValuationSnapshot(snapshot: ValuationSnapshot): Promise<void> {
    const validated = ValuationSnapshotSchema.parse(snapshot);
    const database = await getDB();
    await database.add('valuationSnapshots', validated);
  },

  // Bulk operations with transaction support
  async bulkSaveItems(items: InventoryItem[]): Promise<void> {
    const database = await getDB();
    const tx = database.transaction('items', 'readwrite');
    await Promise.all([
      ...items.map(item => tx.store.put(InventoryItemSchema.parse(item))),
      tx.done,
    ]);
  },

  async bulkAddMovements(movements: StockMovement[]): Promise<void> {
    const database = await getDB();
    const tx = database.transaction('movements', 'readwrite');
    await Promise.all([
      ...movements.map(mov => tx.store.add(StockMovementSchema.parse(mov))),
      tx.done,
    ]);
  },

  // Clear all data (for testing/reset)
  async clearAll(): Promise<void> {
    const database = await getDB();
    await Promise.all([
      database.clear('items'),
      database.clear('categories'),
      database.clear('locations'),
      database.clear('movements'),
      database.clear('auditLogs'),
      database.clear('valuationSnapshots'),
    ]);
  },

  // Recovery: Save session state for crash recovery
  async saveRecoveryState(state: {
    items: InventoryItem[];
    categories: Category[];
    locations: Location[];
    movements: StockMovement[];
    auditLogs: AuditLog[];
    pendingOperations?: Array<{ type: string; data: unknown; timestamp: string }>;
  }): Promise<void> {
    try {
      const recoveryData = {
        timestamp: new Date().toISOString(),
        state,
      };
      localStorage.setItem('inventory_recovery_state', JSON.stringify(recoveryData));
    } catch (error) {
      console.error('Failed to save recovery state:', error);
    }
  },

  // Recovery: Load session state after crash/reload
  async loadRecoveryState(): Promise<{
    timestamp: string;
    state: {
      items: InventoryItem[];
      categories: Category[];
      locations: Location[];
      movements: StockMovement[];
      auditLogs: AuditLog[];
      pendingOperations?: Array<{ type: string; data: unknown; timestamp: string }>;
    };
  } | null> {
    try {
      const recoveryData = localStorage.getItem('inventory_recovery_state');
      if (!recoveryData) return null;
      return JSON.parse(recoveryData);
    } catch (error) {
      console.error('Failed to load recovery state:', error);
      return null;
    }
  },

  // Recovery: Clear recovery state after successful load
  async clearRecoveryState(): Promise<void> {
    try {
      localStorage.removeItem('inventory_recovery_state');
    } catch (error) {
      console.error('Failed to clear recovery state:', error);
    }
  },

  // Recovery: Check if recovery is needed
  async needsRecovery(): Promise<boolean> {
    try {
      const recoveryData = localStorage.getItem('inventory_recovery_state');
      if (!recoveryData) return false;
      
      const { timestamp } = JSON.parse(recoveryData);
      const recoveryTime = new Date(timestamp).getTime();
      const now = Date.now();
      
      // Recovery is valid for 24 hours
      return (now - recoveryTime) < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  },

  // Recovery: Validate database integrity
  async validateIntegrity(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const database = await getDB();
      
      // Check items exist
      const items = await database.getAll('items');
      const movements = await database.getAll('movements');
      
      // Check movement references
      const itemIds = new Set(items.map(i => i.id));
      const orphanedMovements = movements.filter(m => !itemIds.has(m.itemId));
      if (orphanedMovements.length > 0) {
        issues.push(`Found ${orphanedMovements.length} movements referencing deleted items`);
      }
      
      // Check for quantity consistency
      for (const item of items) {
        const itemMovements = movements.filter(m => m.itemId === item.id);
        if (itemMovements.length > 0) {
          const sortedMovements = [...itemMovements].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const latestQuantity = sortedMovements[0].newQuantity;
          if (latestQuantity < 0) {
            issues.push(`Item ${item.name} has negative quantity: ${latestQuantity}`);
          }
        }
      }
      
      return { valid: issues.length === 0, issues };
    } catch (error) {
      issues.push(`Database validation error: ${(error as Error).message}`);
      return { valid: false, issues };
    }
  },
};

export default db;
