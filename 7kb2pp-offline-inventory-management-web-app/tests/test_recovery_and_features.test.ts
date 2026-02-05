import { db } from '../repository_after/src/lib/db';
import { InventoryItem, Category, Location } from '../repository_after/src/lib/schemas';

describe('Recovery System Tests', () => {
  beforeEach(async () => {
    // Clear any existing recovery state
    await db.clearRecoveryState();
  });

  afterEach(async () => {
    await db.clearRecoveryState();
  });

  test('should save recovery state', async () => {
    const mockState = {
      items: [] as InventoryItem[],
      categories: [] as Category[],
      locations: [] as Location[],
    };

    await db.saveRecoveryState(mockState);
    const recovered = await db.loadRecoveryState();

    expect(recovered).not.toBeNull();
    expect(recovered?.state.items).toEqual([]);
    expect(recovered?.state.categories).toEqual([]);
    expect(recovered?.state.locations).toEqual([]);
  });

  test('should detect when recovery is needed', async () => {
    const mockState = {
      items: [] as InventoryItem[],
      categories: [] as Category[],
      locations: [] as Location[],
    };

    await db.saveRecoveryState(mockState);
    const needsRecovery = await db.needsRecovery();

    expect(needsRecovery).toBe(true);
  });

  test('should not need recovery when no state exists', async () => {
    const needsRecovery = await db.needsRecovery();
    expect(needsRecovery).toBe(false);
  });

  test('should clear recovery state', async () => {
    const mockState = {
      items: [] as InventoryItem[],
      categories: [] as Category[],
      locations: [] as Location[],
    };

    await db.saveRecoveryState(mockState);
    await db.clearRecoveryState();
    
    const needsRecovery = await db.needsRecovery();
    expect(needsRecovery).toBe(false);
  });
});

describe('Valuation Snapshots Tests', () => {
  test('should create and retrieve valuation snapshot', async () => {
    const snapshot = {
      id: '550e8400-e29b-41d4-a716-446655440200',
      timestamp: new Date().toISOString(),
      totalValue: 10000,
      itemCount: 50,
      categoryBreakdown: {
        'cat1': 5000,
        'cat2': 5000,
      },
      locationBreakdown: {
        'loc1': 6000,
        'loc2': 4000,
      },
    };

    await db.addValuationSnapshot(snapshot);
    const snapshots = await db.getAllValuationSnapshots();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].totalValue).toBe(10000);
    expect(snapshots[0].itemCount).toBe(50);
  });
});

describe('Database Integrity Tests', () => {
  test('should validate database integrity', async () => {
    const result = await db.validateIntegrity();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

describe('SKU Duplicate Detection Tests', () => {
  const mockItem: InventoryItem = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Item',
    sku: 'SKU-UNIQUE-001',
    categoryId: null,
    locationId: null,
    unitCost: 10,
    reorderThreshold: 5,
    lifecycleStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await db.clearAll();
  });

  test('should detect duplicate SKU', async () => {
    await db.saveItem(mockItem);
    
    const duplicate = await db.getItemBySku(mockItem.sku);
    expect(duplicate).not.toBeUndefined();
    expect(duplicate?.id).toBe(mockItem.id);
  });

  test('should return undefined for non-existent SKU', async () => {
    const item = await db.getItemBySku('NON-EXISTENT-SKU');
    expect(item).toBeUndefined();
  });
});
