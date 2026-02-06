import { useInventoryStore } from '../repository_after/src/lib/store';
import { InventoryItem, Category, Location } from '../repository_after/src/lib/schemas';
import { db } from '../repository_after/src/lib/db';

describe('Store Bulk Operations Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
    // Reset the store
    useInventoryStore.setState({
      items: [],
      categories: [],
      locations: [],
      movements: [],
      auditLogs: [],
      valuationSnapshots: [],
      isLoading: false,
      error: null,
      filter: {},
    });
  });

  test('bulkUpdateItems should update multiple items', async () => {
    const store = useInventoryStore.getState();
    
    // Create test items
    const item1 = await store.addItem({
      name: 'Item 1',
      sku: 'SKU-001',
      categoryId: null,
      locationId: null,
      unitCost: 10,
      reorderThreshold: 5,
      lifecycleStatus: 'active',
    });
    
    const item2 = await store.addItem({
      name: 'Item 2',
      sku: 'SKU-002',
      categoryId: null,
      locationId: null,
      unitCost: 20,
      reorderThreshold: 10,
      lifecycleStatus: 'active',
    });

    // Create a category for bulk update
    const category = await store.addCategory({
      name: 'Test Category',
      description: 'For bulk testing',
    });

    // Bulk update
    await store.bulkUpdateItems({
      itemIds: [item1.id, item2.id],
      updates: {
        categoryId: category.id,
        lifecycleStatus: 'reserved',
      },
    });

    // Verify updates
    const updatedState = useInventoryStore.getState();
    const updatedItem1 = updatedState.items.find(i => i.id === item1.id);
    const updatedItem2 = updatedState.items.find(i => i.id === item2.id);

    expect(updatedItem1?.categoryId).toBe(category.id);
    expect(updatedItem1?.lifecycleStatus).toBe('reserved');
    expect(updatedItem2?.categoryId).toBe(category.id);
    expect(updatedItem2?.lifecycleStatus).toBe('reserved');
  });

  test('bulkUpdateItems should rollback on failure', async () => {
    const store = useInventoryStore.getState();
    
    const item1 = await store.addItem({
      name: 'Item 1',
      sku: 'SKU-003',
      categoryId: null,
      locationId: null,
      unitCost: 10,
      reorderThreshold: 5,
      lifecycleStatus: 'active',
    });

    // Try to update with invalid data (non-existent item in list)
    try {
      await store.bulkUpdateItems({
        itemIds: [item1.id, 'non-existent-id'],
        updates: {
          lifecycleStatus: 'archived',
        },
      });
    } catch (error) {
      // Expected to fail
      expect(error).toBeDefined();
    }

    // Verify item1 was not updated due to rollback
    const state = useInventoryStore.getState();
    const item = state.items.find(i => i.id === item1.id);
    expect(item?.lifecycleStatus).toBe('active'); // Should still be active
  });
});

describe('Store Valuation Snapshots Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
    useInventoryStore.setState({
      items: [],
      categories: [],
      locations: [],
      movements: [],
      auditLogs: [],
      valuationSnapshots: [],
      isLoading: false,
      error: null,
      filter: {},
    });
  });

  test('should create valuation snapshot', async () => {
    const store = useInventoryStore.getState();
    
    // Create an item
    const item = await store.addItem({
      name: 'Snapshot Test Item',
      sku: 'SKU-SNAP-001',
      categoryId: null,
      locationId: null,
      unitCost: 100,
      reorderThreshold: 10,
      lifecycleStatus: 'active',
    });

    // Record some movements
    await store.recordMovement(item.id, 'inbound', 50);

    // Create snapshot
    const snapshot = await store.addValuationSnapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.totalValue).toBeGreaterThan(0);
    expect(snapshot.itemCount).toBe(1);
    expect(snapshot.timestamp).toBeDefined();
  });

  test('should retrieve all valuation snapshots', async () => {
    const store = useInventoryStore.getState();
    
    // Create multiple snapshots
    await store.addValuationSnapshot();
    await store.addValuationSnapshot();

    const state = useInventoryStore.getState();
    expect(state.valuationSnapshots.length).toBe(2);
  });
});

describe('Store Export Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
    useInventoryStore.setState({
      items: [],
      categories: [],
      locations: [],
      movements: [],
      auditLogs: [],
      valuationSnapshots: [],
      isLoading: false,
      error: null,
      filter: {},
    });
  });

  test('exportValuationSummary should include health metrics', async () => {
    const store = useInventoryStore.getState();
    
    const item = await store.addItem({
      name: 'Export Test Item',
      sku: 'SKU-EXP-001',
      categoryId: null,
      locationId: null,
      unitCost: 50,
      reorderThreshold: 10,
      lifecycleStatus: 'active',
    });

    await store.recordMovement(item.id, 'inbound', 100);

    const summary = store.exportValuationSummary();

    expect(summary).toHaveProperty('exportedAt');
    expect(summary).toHaveProperty('summary');
    expect(summary).toHaveProperty('healthMetrics');
    expect(summary).toHaveProperty('categoryBreakdown');
    expect(summary).toHaveProperty('locationBreakdown');
    expect(summary.summary.totalItems).toBe(1);
    expect(summary.summary.totalValue).toBeGreaterThan(0);
  });

  test('exportAnalyticsSnapshot should include expiration and shrinkage data', async () => {
    const store = useInventoryStore.getState();
    
    const item = await store.addItem({
      name: 'Analytics Test Item',
      sku: 'SKU-ANA-001',
      categoryId: null,
      locationId: null,
      unitCost: 30,
      reorderThreshold: 5,
      lifecycleStatus: 'active',
    });

    await store.recordMovement(item.id, 'inbound', 100);
    await store.recordMovement(item.id, 'adjustment', -5, 'Shrinkage');

    const snapshot = store.exportAnalyticsSnapshot();

    expect(snapshot).toHaveProperty('snapshotAt');
    expect(snapshot).toHaveProperty('inventoryHealth');
    expect(snapshot).toHaveProperty('expirationRisk');
    expect(snapshot).toHaveProperty('shrinkageIndicators');
    expect(snapshot).toHaveProperty('stockStatus');
    expect(snapshot.shrinkageIndicators.totalShrinkageEvents).toBeGreaterThan(0);
  });
});
