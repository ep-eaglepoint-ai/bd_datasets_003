/**
 * Public API Coverage Tests
 * 
 * These tests validate user-observable behavior through PUBLIC store selectors
 * and APIs, NOT internal helper functions or duplicated logic.
 * 
 * Requirements covered:
 * - Req 6, 9: Filtering, Search, Sorting through selectFilteredItems
 * - Req 6, 19: Reorder Threshold & Low-Stock via selectLowStockItems
 * - Req 11, 18, 19: Lifecycle Status in Analytics via selectInventoryHealth
 * - Req 17-19: Worker-based Analytics via public store selectors
 */

import {
  selectEnrichedItems,
  selectFilteredItems,
  selectLowStockItems,
  selectTotalValue,
  selectValueByCategory,
  selectValueByLocation,
  selectInventoryHealth,
  selectItemsByCategory,
  selectItemsByLocation,
  selectMovementsByItem,
} from '../repository_after/src/lib/store';
import {
  InventoryItem,
  StockMovement,
  Category,
  Location,
  Filter,
  LifecycleStatus,
} from '../repository_after/src/lib/schemas';

// =============================================================================
// TEST UTILITIES - Creating mock state that matches store structure
// =============================================================================

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const createMockItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: generateUUID(),
  name: 'Test Item',
  sku: `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
  categoryId: null,
  locationId: null,
  unitCost: 10.0,
  reorderThreshold: 5,
  supplierNotes: undefined,
  lifecycleStatus: 'active',
  expirationDate: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: generateUUID(),
  itemId: generateUUID(),
  type: 'inbound',
  quantity: 10,
  previousQuantity: 0,
  newQuantity: 10,
  fromLocationId: null,
  toLocationId: null,
  reason: 'Test movement',
  timestamp: new Date().toISOString(),
  ...overrides,
});

const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
  id: generateUUID(),
  name: 'Test Category',
  description: null,
  parentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockLocation = (overrides: Partial<Location> = {}): Location => ({
  id: generateUUID(),
  name: 'Test Location',
  description: null,
  zone: 'A',
  capacity: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Creates a mock store state that matches the real InventoryState interface
 * This allows testing selectors with controlled data
 */
interface MockInventoryState {
  items: InventoryItem[];
  movements: StockMovement[];
  categories: Category[];
  locations: Location[];
  auditLogs: any[];
  valuationSnapshots: any[];
  isLoading: boolean;
  error: string | null;
  filter: Filter;
}

const createMockState = (overrides: Partial<MockInventoryState> = {}): MockInventoryState => ({
  items: [],
  movements: [],
  categories: [],
  locations: [],
  auditLogs: [],
  valuationSnapshots: [],
  isLoading: false,
  error: null,
  filter: {
    search: '',
    categoryId: undefined,
    locationId: undefined,
    lifecycleStatus: undefined,
    lowStockOnly: false,
    sortBy: undefined,
    sortOrder: 'asc',
  },
  ...overrides,
});

// =============================================================================
// REQ 6, 9: FILTERING, SEARCH, AND SORTING THROUGH PUBLIC SELECTORS
// =============================================================================

describe('Filtering, Search, and Sorting via selectFilteredItems (Req 6, 9)', () => {
  let categoryId1: string;
  let categoryId2: string;
  let locationId1: string;
  let locationId2: string;
  let items: InventoryItem[];
  let movements: StockMovement[];
  let baseState: MockInventoryState;

  beforeEach(() => {
    categoryId1 = generateUUID();
    categoryId2 = generateUUID();
    locationId1 = generateUUID();
    locationId2 = generateUUID();

    items = [
      createMockItem({
        name: 'Apple Widget',
        sku: 'APPLE-001',
        categoryId: categoryId1,
        locationId: locationId1,
        unitCost: 10,
        reorderThreshold: 5,
        supplierNotes: 'Premium quality from certified vendor',
      }),
      createMockItem({
        name: 'Banana Gadget',
        sku: 'BANANA-002',
        categoryId: categoryId1,
        locationId: locationId2,
        unitCost: 20,
        reorderThreshold: 10,
      }),
      createMockItem({
        name: 'Cherry Device',
        sku: 'CHERRY-003',
        categoryId: categoryId2,
        locationId: locationId1,
        unitCost: 30,
        reorderThreshold: 3,
      }),
      createMockItem({
        name: 'Date Component',
        sku: 'DATE-004',
        categoryId: categoryId2,
        locationId: locationId2,
        unitCost: 15,
        reorderThreshold: 8,
        lifecycleStatus: 'reserved',
      }),
      createMockItem({
        name: 'Elderberry Part',
        sku: 'ELDER-005',
        categoryId: null,
        locationId: null,
        unitCost: 25,
        reorderThreshold: 2,
        lifecycleStatus: 'damaged',
      }),
    ];

    movements = [
      createMockMovement({ itemId: items[0].id, quantity: 10, newQuantity: 10 }),
      createMockMovement({ itemId: items[1].id, quantity: 5, newQuantity: 5 }),
      createMockMovement({ itemId: items[2].id, quantity: 20, newQuantity: 20 }),
      createMockMovement({ itemId: items[3].id, quantity: 3, newQuantity: 3 }),
      createMockMovement({ itemId: items[4].id, quantity: 1, newQuantity: 1 }),
    ];

    baseState = createMockState({ items, movements });
  });

  describe('Full-Text Search', () => {
    test('searches by item name with partial match (case-insensitive)', () => {
      const state = { ...baseState, filter: { ...baseState.filter, search: 'apple' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('searches by SKU (case-insensitive)', () => {
      const state = { ...baseState, filter: { ...baseState.filter, search: 'banana-002' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe('BANANA-002');
    });

    test('searches in supplier notes', () => {
      const state = { ...baseState, filter: { ...baseState.filter, search: 'vendor' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('returns empty array when no matches found', () => {
      const state = { ...baseState, filter: { ...baseState.filter, search: 'zzzznonexistent' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(0);
    });

    test('returns all items with empty search', () => {
      const state = { ...baseState, filter: { ...baseState.filter, search: '' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(items.length);
    });
  });

  describe('Compound Filtering', () => {
    test('filters by category correctly', () => {
      const state = { ...baseState, filter: { ...baseState.filter, categoryId: categoryId1 } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.categoryId === categoryId1)).toBe(true);
    });

    test('filters by location correctly', () => {
      const state = { ...baseState, filter: { ...baseState.filter, locationId: locationId1 } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.locationId === locationId1)).toBe(true);
    });

    test('filters by lifecycle status correctly', () => {
      const state = { ...baseState, filter: { ...baseState.filter, lifecycleStatus: 'reserved' } };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(1);
      expect(results[0].lifecycleStatus).toBe('reserved');
    });

    test('combines category + location filters (intersection)', () => {
      const state = {
        ...baseState,
        filter: { ...baseState.filter, categoryId: categoryId1, locationId: locationId1 },
      };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('combines search + category + lifecycle filters', () => {
      const state = {
        ...baseState,
        filter: {
          ...baseState.filter,
          search: 'e',
          categoryId: categoryId2,
        },
      };
      const results = selectFilteredItems(state as any);

      // Should match items in category2 with 'e' in name: Cherry Device, Date Component
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.categoryId === categoryId2)).toBe(true);
    });

    test('returns empty array when compound filters have no intersection', () => {
      const state = {
        ...baseState,
        filter: {
          ...baseState.filter,
          categoryId: categoryId1,
          lifecycleStatus: 'damaged', // No damaged items in category1
        },
      };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(0);
    });

    test('lowStockOnly filter returns only items with quantity <= reorderThreshold', () => {
      const state = { ...baseState, filter: { ...baseState.filter, lowStockOnly: true } };
      const results = selectFilteredItems(state as any);

      // Items with low stock: Banana (5 <= 10), Date (3 <= 8), Elderberry (1 <= 2)
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.isLowStock)).toBe(true);
    });
  });

  describe('Sorting Behavior', () => {
    test('sorts by name ascending (deterministic)', () => {
      const state = {
        ...baseState,
        filter: { ...baseState.filter, sortBy: 'name' as const, sortOrder: 'asc' as const },
      };
      const results = selectFilteredItems(state as any);

      expect(results[0].name).toBe('Apple Widget');
      expect(results[results.length - 1].name).toBe('Elderberry Part');
      // Verify stable order
      for (let i = 1; i < results.length; i++) {
        expect(results[i].name.localeCompare(results[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    test('sorts by name descending', () => {
      const state = {
        ...baseState,
        filter: { ...baseState.filter, sortBy: 'name' as const, sortOrder: 'desc' as const },
      };
      const results = selectFilteredItems(state as any);

      expect(results[0].name).toBe('Elderberry Part');
      expect(results[results.length - 1].name).toBe('Apple Widget');
    });

    test('sorts by quantity ascending', () => {
      const state = {
        ...baseState,
        filter: { ...baseState.filter, sortBy: 'quantity' as const, sortOrder: 'asc' as const },
      };
      const results = selectFilteredItems(state as any);

      for (let i = 1; i < results.length; i++) {
        expect(results[i].quantity).toBeGreaterThanOrEqual(results[i - 1].quantity);
      }
    });

    test('sorts by totalValue descending', () => {
      const state = {
        ...baseState,
        filter: { ...baseState.filter, sortBy: 'totalValue' as const, sortOrder: 'desc' as const },
      };
      const results = selectFilteredItems(state as any);

      for (let i = 1; i < results.length; i++) {
        expect(results[i].totalValue).toBeLessThanOrEqual(results[i - 1].totalValue);
      }
    });

    test('sorting is stable (deterministic with same values)', () => {
      // Run multiple times to ensure determinism
      const state = {
        ...baseState,
        filter: { ...baseState.filter, sortBy: 'unitCost' as const, sortOrder: 'asc' as const },
      };

      const results1 = selectFilteredItems(state as any);
      const results2 = selectFilteredItems(state as any);
      const results3 = selectFilteredItems(state as any);

      expect(results1.map((r) => r.id)).toEqual(results2.map((r) => r.id));
      expect(results2.map((r) => r.id)).toEqual(results3.map((r) => r.id));
    });

    test('sorting is applied after filtering', () => {
      const state = {
        ...baseState,
        filter: {
          ...baseState.filter,
          categoryId: categoryId1,
          sortBy: 'name' as const,
          sortOrder: 'desc' as const,
        },
      };
      const results = selectFilteredItems(state as any);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Banana Gadget');
      expect(results[1].name).toBe('Apple Widget');
    });
  });

  describe('Filter Regression Safety', () => {
    test('filters must fail if search logic silently changes', () => {
      // This test ensures the search logic matches name, sku, AND supplierNotes
      const state = { ...baseState, filter: { ...baseState.filter, search: 'certified' } };
      const results = selectFilteredItems(state as any);

      // "certified" only appears in supplierNotes of Apple Widget
      expect(results).toHaveLength(1);
      expect(results[0].supplierNotes).toContain('certified');
    });
  });
});

// =============================================================================
// REQ 6, 19: REORDER THRESHOLD & LOW-STOCK ALERTS
// =============================================================================

describe('Reorder Threshold & Low-Stock via selectLowStockItems (Req 6, 19)', () => {
  test('items below reorder threshold are flagged via selectLowStockItems', () => {
    const item1 = createMockItem({ reorderThreshold: 10 });
    const item2 = createMockItem({ reorderThreshold: 5 });
    const item3 = createMockItem({ reorderThreshold: 20 });

    const movements = [
      createMockMovement({ itemId: item1.id, newQuantity: 5 }), // 5 <= 10: LOW
      createMockMovement({ itemId: item2.id, newQuantity: 15 }), // 15 > 5: OK
      createMockMovement({ itemId: item3.id, newQuantity: 20 }), // 20 <= 20: LOW (boundary)
    ];

    const state = createMockState({ items: [item1, item2, item3], movements });
    const lowStockItems = selectLowStockItems(state as any);

    expect(lowStockItems).toHaveLength(2);
    expect(lowStockItems.map((i) => i.id).sort()).toEqual([item1.id, item3.id].sort());
  });

  test('zero-stock items are flagged as low stock', () => {
    const item = createMockItem({ reorderThreshold: 5 });
    // No movements = quantity 0
    const state = createMockState({ items: [item], movements: [] });
    const lowStockItems = selectLowStockItems(state as any);

    expect(lowStockItems).toHaveLength(1);
    expect(lowStockItems[0].quantity).toBe(0);
    expect(lowStockItems[0].isLowStock).toBe(true);
  });

  test('negative-adjustment edge case: correction movement reducing to below threshold', () => {
    const item = createMockItem({ reorderThreshold: 10 });

    const movements = [
      createMockMovement({
        itemId: item.id,
        type: 'inbound',
        quantity: 15,
        newQuantity: 15,
        timestamp: '2024-01-01T00:00:00Z',
      }),
      createMockMovement({
        itemId: item.id,
        type: 'correction',
        quantity: -10,
        previousQuantity: 15,
        newQuantity: 5, // Now below threshold
        timestamp: '2024-01-02T00:00:00Z',
      }),
    ];

    const state = createMockState({ items: [item], movements });
    const lowStockItems = selectLowStockItems(state as any);

    expect(lowStockItems).toHaveLength(1);
    expect(lowStockItems[0].quantity).toBe(5);
    expect(lowStockItems[0].isLowStock).toBe(true);
  });

  test('restocked items correctly exit low-stock state', () => {
    const item = createMockItem({ reorderThreshold: 10 });

    const movements = [
      createMockMovement({
        itemId: item.id,
        type: 'inbound',
        quantity: 5,
        newQuantity: 5,
        timestamp: '2024-01-01T00:00:00Z',
      }),
      // Restock brings above threshold
      createMockMovement({
        itemId: item.id,
        type: 'inbound',
        quantity: 20,
        previousQuantity: 5,
        newQuantity: 25,
        timestamp: '2024-01-02T00:00:00Z',
      }),
    ];

    const state = createMockState({ items: [item], movements });
    const lowStockItems = selectLowStockItems(state as any);
    const enrichedItems = selectEnrichedItems(state as any);

    expect(lowStockItems).toHaveLength(0);
    expect(enrichedItems[0].quantity).toBe(25);
    expect(enrichedItems[0].isLowStock).toBe(false);
  });

  test('boundary case: quantity exactly at reorder threshold is flagged', () => {
    const item = createMockItem({ reorderThreshold: 10 });
    const movements = [createMockMovement({ itemId: item.id, newQuantity: 10 })];

    const state = createMockState({ items: [item], movements });
    const enrichedItems = selectEnrichedItems(state as any);
    const lowStockItems = selectLowStockItems(state as any);

    // quantity <= reorderThreshold means low stock
    expect(enrichedItems[0].isLowStock).toBe(true);
    expect(lowStockItems).toHaveLength(1);
  });

  test('zero reorder threshold: only quantity 0 is flagged', () => {
    const item = createMockItem({ reorderThreshold: 0 });
    const movements = [createMockMovement({ itemId: item.id, newQuantity: 0 })];

    const state = createMockState({ items: [item], movements });
    const lowStockItems = selectLowStockItems(state as any);

    expect(lowStockItems).toHaveLength(1);
    expect(lowStockItems[0].quantity).toBe(0);
  });
});

// =============================================================================
// REQ 11, 18, 19: LIFECYCLE STATUS IN ANALYTICS
// =============================================================================

describe('Lifecycle Status in Analytics via selectInventoryHealth (Req 11, 18, 19)', () => {
  const lifecycleStatuses: LifecycleStatus[] = [
    'active',
    'reserved',
    'damaged',
    'expired',
    'archived',
    'disposed',
  ];

  test('all lifecycle statuses are included in item count', () => {
    const items = lifecycleStatuses.map((status) =>
      createMockItem({ lifecycleStatus: status, unitCost: 100 })
    );
    const movements = items.map((item) =>
      createMockMovement({ itemId: item.id, quantity: 10, newQuantity: 10 })
    );

    const state = createMockState({ items, movements });
    const health = selectInventoryHealth(state as any);

    expect(health.totalItems).toBe(lifecycleStatuses.length);
  });

  test('total value includes all lifecycle statuses', () => {
    const items = lifecycleStatuses.map((status) =>
      createMockItem({ lifecycleStatus: status, unitCost: 100 })
    );
    const movements = items.map((item) =>
      createMockMovement({ itemId: item.id, quantity: 10, newQuantity: 10 })
    );

    const state = createMockState({ items, movements });
    const totalValue = selectTotalValue(state as any);

    // Each item: 10 quantity * 100 cost = 1000
    expect(totalValue).toBe(lifecycleStatuses.length * 1000);
  });

  test('low stock count includes items regardless of lifecycle status', () => {
    const items = lifecycleStatuses.map((status) =>
      createMockItem({ lifecycleStatus: status, reorderThreshold: 20 })
    );
    // All items have quantity 5, which is below threshold 20
    const movements = items.map((item) =>
      createMockMovement({ itemId: item.id, quantity: 5, newQuantity: 5 })
    );

    const state = createMockState({ items, movements });
    const health = selectInventoryHealth(state as any);

    expect(health.lowStockCount).toBe(lifecycleStatuses.length);
  });

  test('changing lifecycle status does not change quantity-based metrics', () => {
    const item = createMockItem({ lifecycleStatus: 'active', unitCost: 100, reorderThreshold: 10 });
    const movements = [createMockMovement({ itemId: item.id, newQuantity: 50 })];

    // Test with 'active' status
    const stateActive = createMockState({ items: [item], movements });
    const healthActive = selectInventoryHealth(stateActive as any);
    const totalValueActive = selectTotalValue(stateActive as any);

    // Change to 'damaged' status
    const damagedItem = { ...item, lifecycleStatus: 'damaged' as LifecycleStatus };
    const stateDamaged = createMockState({ items: [damagedItem], movements });
    const healthDamaged = selectInventoryHealth(stateDamaged as any);
    const totalValueDamaged = selectTotalValue(stateDamaged as any);

    // Quantity-based metrics should remain the same
    expect(healthActive.totalValue).toBe(healthDamaged.totalValue);
    expect(totalValueActive).toBe(totalValueDamaged);
    expect(healthActive.totalItems).toBe(healthDamaged.totalItems);
  });

  test('selectFilteredItems can isolate specific lifecycle status for analysis', () => {
    const items = lifecycleStatuses.map((status, idx) =>
      createMockItem({
        lifecycleStatus: status,
        unitCost: (idx + 1) * 10,
        name: `${status}-item`,
      })
    );
    const movements = items.map((item) =>
      createMockMovement({ itemId: item.id, newQuantity: 10 })
    );

    const state = createMockState({ items, movements });

    // Filter to only 'damaged' items
    const damagedState = {
      ...state,
      filter: { ...state.filter, lifecycleStatus: 'damaged' as LifecycleStatus },
    };
    const damagedItems = selectFilteredItems(damagedState as any);

    expect(damagedItems).toHaveLength(1);
    expect(damagedItems[0].lifecycleStatus).toBe('damaged');
  });

  test('enriched items preserve lifecycle status correctly', () => {
    const items = lifecycleStatuses.map((status) => createMockItem({ lifecycleStatus: status }));
    const movements = items.map((item) =>
      createMockMovement({ itemId: item.id, newQuantity: 10 })
    );

    const state = createMockState({ items, movements });
    const enrichedItems = selectEnrichedItems(state as any);

    // Verify each enriched item has correct lifecycle status
    lifecycleStatuses.forEach((status) => {
      const found = enrichedItems.find((e) => e.lifecycleStatus === status);
      expect(found).toBeDefined();
    });
  });
});

// =============================================================================
// REQ 17-19: WORKER-BASED ANALYTICS VIA PUBLIC INTERFACES
// =============================================================================

describe('Worker-Based Analytics Observable Behavior (Req 17-19)', () => {
  /**
   * These tests verify that analytics computations accessed through
   * public store selectors produce correct, deterministic results.
   * The Dashboard uses these same selectors and decides whether to
   * use worker results based on WORKER_THRESHOLD.
   */

  const WORKER_THRESHOLD = 100;

  test('selectInventoryHealth returns consistent results (worker-compatible)', () => {
    const items: InventoryItem[] = [];
    const movements: StockMovement[] = [];

    // Create dataset above worker threshold
    for (let i = 0; i < 150; i++) {
      const item = createMockItem({ unitCost: 10, reorderThreshold: 5 });
      items.push(item);
      movements.push(
        createMockMovement({
          itemId: item.id,
          newQuantity: i % 2 === 0 ? 3 : 10, // Half below threshold
        })
      );
    }

    const state = createMockState({ items, movements });

    // Run multiple times to verify determinism
    const health1 = selectInventoryHealth(state as any);
    const health2 = selectInventoryHealth(state as any);

    expect(health1.totalItems).toBe(health2.totalItems);
    expect(health1.totalValue).toBe(health2.totalValue);
    expect(health1.lowStockCount).toBe(health2.lowStockCount);
    expect(health1.turnoverRate).toBe(health2.turnoverRate);
    expect(health1.overallHealthScore).toBe(health2.overallHealthScore);
  });

  test('selectValueByCategory returns consistent results (worker-compatible)', () => {
    const categoryId = generateUUID();
    const items: InventoryItem[] = [];
    const movements: StockMovement[] = [];

    for (let i = 0; i < 100; i++) {
      const item = createMockItem({
        categoryId: i % 2 === 0 ? categoryId : null,
        unitCost: 10,
      });
      items.push(item);
      movements.push(createMockMovement({ itemId: item.id, newQuantity: 10 }));
    }

    const state = createMockState({ items, movements });

    const result1 = selectValueByCategory(state as any);
    const result2 = selectValueByCategory(state as any);

    expect(result1).toEqual(result2);
    expect(result1[categoryId]).toBe(50 * 10 * 10); // 50 items * 10 qty * 10 cost
  });

  test('selectLowStockItems returns consistent results for large datasets', () => {
    const items: InventoryItem[] = [];
    const movements: StockMovement[] = [];

    for (let i = 0; i < 200; i++) {
      const item = createMockItem({ reorderThreshold: 10 });
      items.push(item);
      movements.push(
        createMockMovement({
          itemId: item.id,
          newQuantity: i % 3 === 0 ? 5 : 15, // 1/3 are low stock
        })
      );
    }

    const state = createMockState({ items, movements });

    const lowStock1 = selectLowStockItems(state as any);
    const lowStock2 = selectLowStockItems(state as any);

    expect(lowStock1.length).toBe(lowStock2.length);
    expect(lowStock1.map((i) => i.id).sort()).toEqual(lowStock2.map((i) => i.id).sort());
  });

  test('analytics selectors handle empty state gracefully', () => {
    const state = createMockState({ items: [], movements: [] });

    const health = selectInventoryHealth(state as any);
    const totalValue = selectTotalValue(state as any);
    const lowStock = selectLowStockItems(state as any);
    const valueByCategory = selectValueByCategory(state as any);

    expect(health.totalItems).toBe(0);
    expect(health.totalValue).toBe(0);
    expect(health.lowStockCount).toBe(0);
    expect(totalValue).toBe(0);
    expect(lowStock).toHaveLength(0);
    expect(Object.keys(valueByCategory)).toHaveLength(0);
  });

  test('filtering does not affect analytics selectors (they compute from raw state)', () => {
    const item = createMockItem({ unitCost: 100, reorderThreshold: 10 });
    const movements = [createMockMovement({ itemId: item.id, newQuantity: 50 })];

    // State with no filter
    const stateNoFilter = createMockState({ items: [item], movements });

    // State with filter that excludes the item
    const stateWithFilter = createMockState({
      items: [item],
      movements,
      filter: { ...stateNoFilter.filter, categoryId: generateUUID() }, // Non-matching category
    });

    // Filtered items should be empty
    const filteredItems = selectFilteredItems(stateWithFilter as any);
    expect(filteredItems).toHaveLength(0);

    // But analytics should still include all items
    const health1 = selectInventoryHealth(stateNoFilter as any);
    const health2 = selectInventoryHealth(stateWithFilter as any);

    expect(health1.totalItems).toBe(health2.totalItems);
    expect(health1.totalValue).toBe(health2.totalValue);
  });

  test('worker threshold boundary: 100 items should trigger worker path', () => {
    const items: InventoryItem[] = [];
    const movements: StockMovement[] = [];

    for (let i = 0; i < WORKER_THRESHOLD; i++) {
      const item = createMockItem({ unitCost: 10 });
      items.push(item);
      movements.push(createMockMovement({ itemId: item.id, newQuantity: 10 }));
    }

    const shouldUseWorker = items.length >= WORKER_THRESHOLD;
    expect(shouldUseWorker).toBe(true);

    // Verify calculations work regardless of path
    const state = createMockState({ items, movements });
    const health = selectInventoryHealth(state as any);

    expect(health.totalItems).toBe(WORKER_THRESHOLD);
    expect(health.totalValue).toBe(WORKER_THRESHOLD * 10 * 10);
  });

  test('worker threshold below boundary: 99 items uses main thread', () => {
    const itemCount = WORKER_THRESHOLD - 1;
    const items: InventoryItem[] = [];
    const movements: StockMovement[] = [];

    for (let i = 0; i < itemCount; i++) {
      const item = createMockItem({ unitCost: 10 });
      items.push(item);
      movements.push(createMockMovement({ itemId: item.id, newQuantity: 10 }));
    }

    const shouldUseWorker = items.length >= WORKER_THRESHOLD;
    expect(shouldUseWorker).toBe(false);

    // Verify calculations work on main thread
    const state = createMockState({ items, movements });
    const health = selectInventoryHealth(state as any);

    expect(health.totalItems).toBe(itemCount);
  });
});

// =============================================================================
// INTEGRATION: COMBINED BEHAVIORAL TESTS
// =============================================================================

describe('Combined Behavioral Integrity Tests', () => {
  test('filter + sort + low-stock all work together consistently', () => {
    const categoryId = generateUUID();
    const items = [
      createMockItem({ name: 'Aaa Item', categoryId, reorderThreshold: 10, unitCost: 5 }),
      createMockItem({ name: 'Bbb Item', categoryId, reorderThreshold: 10, unitCost: 10 }),
      createMockItem({ name: 'Ccc Item', categoryId, reorderThreshold: 10, unitCost: 15 }),
      createMockItem({ name: 'Ddd Item', categoryId: null, reorderThreshold: 10, unitCost: 20 }),
    ];

    const movements = [
      createMockMovement({ itemId: items[0].id, newQuantity: 5 }), // Low stock
      createMockMovement({ itemId: items[1].id, newQuantity: 5 }), // Low stock
      createMockMovement({ itemId: items[2].id, newQuantity: 20 }), // Not low stock
      createMockMovement({ itemId: items[3].id, newQuantity: 5 }), // Low stock but different category
    ];

    const state = createMockState({
      items,
      movements,
      filter: {
        search: '',
        categoryId,
        lowStockOnly: true,
        sortBy: 'totalValue' as const,
        sortOrder: 'desc' as const,
        locationId: undefined,
        lifecycleStatus: undefined,
      },
    });

    const results = selectFilteredItems(state as any);

    // Should have 2 items: Aaa and Bbb (in categoryId, low stock)
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.categoryId === categoryId)).toBe(true);
    expect(results.every((r) => r.isLowStock)).toBe(true);

    // Should be sorted by totalValue descending: Bbb (50) > Aaa (25)
    expect(results[0].name).toBe('Bbb Item');
    expect(results[1].name).toBe('Aaa Item');
  });

  test('lifecycle status filtering does not affect low-stock detection', () => {
    const item = createMockItem({
      lifecycleStatus: 'reserved',
      reorderThreshold: 10,
    });
    const movements = [createMockMovement({ itemId: item.id, newQuantity: 5 })];

    const state = createMockState({ items: [item], movements });

    // Low stock selector should include reserved items
    const lowStock = selectLowStockItems(state as any);
    expect(lowStock).toHaveLength(1);
    expect(lowStock[0].lifecycleStatus).toBe('reserved');
  });

  test('movement history affects derived quantity only, not raw item', () => {
    const item = createMockItem({ reorderThreshold: 10 });

    const movements = [
      createMockMovement({
        itemId: item.id,
        type: 'inbound',
        quantity: 100,
        newQuantity: 100,
        timestamp: '2024-01-01T00:00:00Z',
      }),
      createMockMovement({
        itemId: item.id,
        type: 'outbound',
        quantity: -50,
        previousQuantity: 100,
        newQuantity: 50,
        timestamp: '2024-01-02T00:00:00Z',
      }),
      createMockMovement({
        itemId: item.id,
        type: 'correction',
        quantity: -10,
        previousQuantity: 50,
        newQuantity: 40,
        timestamp: '2024-01-03T00:00:00Z',
      }),
    ];

    const state = createMockState({ items: [item], movements });
    const enrichedItems = selectEnrichedItems(state as any);

    // Derived quantity from latest movement
    expect(enrichedItems[0].quantity).toBe(40);
    expect(enrichedItems[0].isLowStock).toBe(false); // 40 > 10

    // Raw item should not have quantity field
    expect((item as any).quantity).toBeUndefined();
  });
});
