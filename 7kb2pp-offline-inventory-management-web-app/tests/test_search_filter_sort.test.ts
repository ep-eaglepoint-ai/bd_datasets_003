/**
 * Tests for Search, Filter, Sort, and Reorder Threshold functionality
 * Requirements 6, 9, 11, 17-19
 */

import { 
  enrichItemsWithQuantities,
  calculateInventoryHealth,
  identifySlowMovingItems,
  identifyOverstockItems,
} from '../repository_after/src/lib/calculations';
import { 
  InventoryItem, 
  StockMovement, 
  InventoryItemWithQuantity,
  Filter,
} from '../repository_after/src/lib/schemas';

// Generate valid UUIDs
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Mock data generators
const createMockItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: generateUUID(),
  name: 'Test Item',
  sku: `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  categoryId: null,
  locationId: null,
  unitCost: 10.00,
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

// Helper function to apply filters (mimics selectFilteredItems logic)
function applyFilters(
  enrichedItems: InventoryItemWithQuantity[],
  filter: Partial<Filter>
): InventoryItemWithQuantity[] {
  let items = [...enrichedItems];
  
  // Text search
  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    items = items.filter(item =>
      item.name.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower) ||
      (item.supplierNotes?.toLowerCase().includes(searchLower))
    );
  }
  
  // Category filter
  if (filter.categoryId !== undefined) {
    items = items.filter(item => item.categoryId === filter.categoryId);
  }
  
  // Location filter
  if (filter.locationId !== undefined) {
    items = items.filter(item => item.locationId === filter.locationId);
  }
  
  // Lifecycle status filter
  if (filter.lifecycleStatus) {
    items = items.filter(item => item.lifecycleStatus === filter.lifecycleStatus);
  }
  
  // Low stock filter
  if (filter.lowStockOnly) {
    items = items.filter(item => item.isLowStock);
  }
  
  // Sorting
  if (filter.sortBy) {
    const sortOrder = filter.sortOrder === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const aVal = a[filter.sortBy!];
      const bVal = b[filter.sortBy!];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * sortOrder;
      }
      return ((aVal as number) - (bVal as number)) * sortOrder;
    });
  }
  
  return items;
}

describe('Search, Filter, and Sort Tests (Req 6, 9, 11)', () => {
  let items: InventoryItem[];
  let movements: StockMovement[];
  let enrichedItems: InventoryItemWithQuantity[];
  let categoryId1: string;
  let categoryId2: string;
  let locationId1: string;
  let locationId2: string;

  beforeEach(() => {
    // Create test data
    categoryId1 = generateUUID();
    categoryId2 = generateUUID();
    locationId1 = generateUUID();
    locationId2 = generateUUID();

    items = [
      createMockItem({ name: 'Apple Widget', sku: 'APPLE-001', categoryId: categoryId1, locationId: locationId1, unitCost: 10, reorderThreshold: 5 }),
      createMockItem({ name: 'Banana Gadget', sku: 'BANANA-002', categoryId: categoryId1, locationId: locationId2, unitCost: 20, reorderThreshold: 10 }),
      createMockItem({ name: 'Cherry Device', sku: 'CHERRY-003', categoryId: categoryId2, locationId: locationId1, unitCost: 30, reorderThreshold: 3, supplierNotes: 'Premium supplier' }),
      createMockItem({ name: 'Date Component', sku: 'DATE-004', categoryId: categoryId2, locationId: locationId2, unitCost: 15, reorderThreshold: 8, lifecycleStatus: 'reserved' }),
      createMockItem({ name: 'Elderberry Part', sku: 'ELDER-005', categoryId: null, locationId: null, unitCost: 25, reorderThreshold: 2, lifecycleStatus: 'damaged' }),
    ];

    // Create movements for each item (varying quantities)
    movements = [
      createMockMovement({ itemId: items[0].id, quantity: 10, newQuantity: 10 }), // Quantity: 10
      createMockMovement({ itemId: items[1].id, quantity: 5, newQuantity: 5 }),   // Quantity: 5 (low stock)
      createMockMovement({ itemId: items[2].id, quantity: 20, newQuantity: 20 }), // Quantity: 20
      createMockMovement({ itemId: items[3].id, quantity: 3, newQuantity: 3 }),   // Quantity: 3 (low stock)
      createMockMovement({ itemId: items[4].id, quantity: 1, newQuantity: 1 }),   // Quantity: 1 (low stock)
    ];

    enrichedItems = enrichItemsWithQuantities(items, movements);
  });

  describe('Full-Text Search', () => {
    test('should search by item name (case-insensitive)', () => {
      const results = applyFilters(enrichedItems, { search: 'apple' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('should search by item name with partial match', () => {
      const results = applyFilters(enrichedItems, { search: 'widget' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('should search by SKU', () => {
      const results = applyFilters(enrichedItems, { search: 'BANANA-002' });
      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe('BANANA-002');
    });

    test('should search by SKU (case-insensitive)', () => {
      const results = applyFilters(enrichedItems, { search: 'cherry' });
      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe('CHERRY-003');
    });

    test('should search in supplier notes', () => {
      const results = applyFilters(enrichedItems, { search: 'premium' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Cherry Device');
    });

    test('should return multiple matches', () => {
      // Search for 'e' which appears in multiple names
      const results = applyFilters(enrichedItems, { search: 'e' });
      expect(results.length).toBeGreaterThan(1);
    });

    test('should return empty array for no matches', () => {
      const results = applyFilters(enrichedItems, { search: 'nonexistent' });
      expect(results).toHaveLength(0);
    });

    test('should handle empty search string', () => {
      const results = applyFilters(enrichedItems, { search: '' });
      expect(results).toHaveLength(items.length);
    });
  });

  describe('Compound Filtering', () => {
    test('should filter by category', () => {
      const results = applyFilters(enrichedItems, { categoryId: categoryId1 });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.categoryId === categoryId1)).toBe(true);
    });

    test('should filter by location', () => {
      const results = applyFilters(enrichedItems, { locationId: locationId1 });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.locationId === locationId1)).toBe(true);
    });

    test('should filter by lifecycle status', () => {
      const results = applyFilters(enrichedItems, { lifecycleStatus: 'reserved' });
      expect(results).toHaveLength(1);
      expect(results[0].lifecycleStatus).toBe('reserved');
    });

    test('should filter by low stock only', () => {
      const results = applyFilters(enrichedItems, { lowStockOnly: true });
      // Items with quantity <= reorderThreshold
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.isLowStock)).toBe(true);
    });

    test('should combine category and location filters', () => {
      const results = applyFilters(enrichedItems, { 
        categoryId: categoryId1, 
        locationId: locationId1 
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('should combine search and category filters', () => {
      const results = applyFilters(enrichedItems, { 
        search: 'widget', 
        categoryId: categoryId1 
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Apple Widget');
    });

    test('should combine multiple filters with low stock', () => {
      const results = applyFilters(enrichedItems, { 
        categoryId: categoryId1, 
        lowStockOnly: true 
      });
      // Only items in category1 that are low stock
      const lowStockInCat1 = enrichedItems.filter(
        i => i.categoryId === categoryId1 && i.isLowStock
      );
      expect(results).toHaveLength(lowStockInCat1.length);
    });

    test('should return empty when filters have no intersection', () => {
      const results = applyFilters(enrichedItems, { 
        categoryId: categoryId1, 
        lifecycleStatus: 'damaged' // No damaged items in category1
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('Sorting Behavior', () => {
    test('should sort by name ascending', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'name', sortOrder: 'asc' });
      expect(results[0].name).toBe('Apple Widget');
      expect(results[results.length - 1].name).toBe('Elderberry Part');
    });

    test('should sort by name descending', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'name', sortOrder: 'desc' });
      expect(results[0].name).toBe('Elderberry Part');
      expect(results[results.length - 1].name).toBe('Apple Widget');
    });

    test('should sort by quantity ascending', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'quantity', sortOrder: 'asc' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].quantity).toBeGreaterThanOrEqual(results[i - 1].quantity);
      }
    });

    test('should sort by quantity descending', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'quantity', sortOrder: 'desc' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].quantity).toBeLessThanOrEqual(results[i - 1].quantity);
      }
    });

    test('should sort by totalValue', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'totalValue', sortOrder: 'desc' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].totalValue).toBeLessThanOrEqual(results[i - 1].totalValue);
      }
    });

    test('should sort by unitCost', () => {
      const results = applyFilters(enrichedItems, { sortBy: 'unitCost', sortOrder: 'asc' });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].unitCost).toBeGreaterThanOrEqual(results[i - 1].unitCost);
      }
    });

    test('should apply sort after filtering', () => {
      const results = applyFilters(enrichedItems, { 
        categoryId: categoryId1,
        sortBy: 'name',
        sortOrder: 'desc'
      });
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Banana Gadget');
      expect(results[1].name).toBe('Apple Widget');
    });
  });

  describe('Large Dataset Performance', () => {
    test('should handle 1000+ items efficiently', () => {
      // Generate large dataset
      const largeItems: InventoryItem[] = [];
      const largeMovements: StockMovement[] = [];
      
      for (let i = 0; i < 1000; i++) {
        const item = createMockItem({
          name: `Item ${i.toString().padStart(4, '0')}`,
          sku: `SKU-${i.toString().padStart(4, '0')}`,
          categoryId: i % 2 === 0 ? categoryId1 : categoryId2,
          unitCost: Math.random() * 100,
          reorderThreshold: Math.floor(Math.random() * 20),
        });
        largeItems.push(item);
        largeMovements.push(createMockMovement({
          itemId: item.id,
          quantity: Math.floor(Math.random() * 50),
          newQuantity: Math.floor(Math.random() * 50),
        }));
      }
      
      const largeEnriched = enrichItemsWithQuantities(largeItems, largeMovements);
      
      const startTime = Date.now();
      
      // Apply complex filter + sort
      const results = applyFilters(largeEnriched, {
        categoryId: categoryId1,
        sortBy: 'quantity',
        sortOrder: 'desc',
      });
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly (< 100ms for 1000 items)
      expect(duration).toBeLessThan(100);
      expect(results.every(r => r.categoryId === categoryId1)).toBe(true);
    });
  });
});

describe('Reorder Threshold Detection Tests (Req 19)', () => {
  let items: InventoryItem[];
  let movements: StockMovement[];

  describe('Low Stock Detection', () => {
    test('should flag item as low stock when quantity equals threshold', () => {
      const item = createMockItem({ reorderThreshold: 10 });
      const movement = createMockMovement({ 
        itemId: item.id, 
        quantity: 10, 
        newQuantity: 10 
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement]);
      expect(enriched[0].isLowStock).toBe(true);
      expect(enriched[0].quantity).toBe(10);
    });

    test('should flag item as low stock when quantity below threshold', () => {
      const item = createMockItem({ reorderThreshold: 10 });
      const movement = createMockMovement({ 
        itemId: item.id, 
        quantity: 5, 
        newQuantity: 5 
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement]);
      expect(enriched[0].isLowStock).toBe(true);
    });

    test('should NOT flag item as low stock when quantity above threshold', () => {
      const item = createMockItem({ reorderThreshold: 10 });
      const movement = createMockMovement({ 
        itemId: item.id, 
        quantity: 15, 
        newQuantity: 15 
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement]);
      expect(enriched[0].isLowStock).toBe(false);
    });

    test('should handle zero quantity', () => {
      const item = createMockItem({ reorderThreshold: 5 });
      // No movements = 0 quantity
      const enriched = enrichItemsWithQuantities([item], []);
      expect(enriched[0].isLowStock).toBe(true);
      expect(enriched[0].quantity).toBe(0);
    });

    test('should handle zero threshold', () => {
      const item = createMockItem({ reorderThreshold: 0 });
      const movement = createMockMovement({ 
        itemId: item.id, 
        quantity: 0, 
        newQuantity: 0 
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement]);
      // Quantity 0 <= threshold 0, so low stock
      expect(enriched[0].isLowStock).toBe(true);
    });

    test('should use latest movement quantity for calculation', () => {
      const item = createMockItem({ reorderThreshold: 10 });
      const now = new Date();
      
      // First movement: 20 units
      const movement1 = createMockMovement({ 
        itemId: item.id, 
        quantity: 20, 
        newQuantity: 20,
        timestamp: new Date(now.getTime() - 1000).toISOString(), // 1 second ago
      });
      
      // Latest movement: 5 units (outbound reduced stock)
      const movement2 = createMockMovement({ 
        itemId: item.id, 
        type: 'outbound',
        quantity: -15, 
        previousQuantity: 20,
        newQuantity: 5,
        timestamp: now.toISOString(), // Now
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement1, movement2]);
      expect(enriched[0].quantity).toBe(5);
      expect(enriched[0].isLowStock).toBe(true);
    });
  });

  describe('Reorder Threshold Edge Cases', () => {
    test('should handle very high threshold', () => {
      const item = createMockItem({ reorderThreshold: 10000 });
      const movement = createMockMovement({ 
        itemId: item.id, 
        quantity: 9999, 
        newQuantity: 9999 
      });
      
      const enriched = enrichItemsWithQuantities([item], [movement]);
      expect(enriched[0].isLowStock).toBe(true);
    });

    test('should handle threshold exactly at quantity boundary', () => {
      for (let threshold = 0; threshold <= 10; threshold++) {
        const item = createMockItem({ reorderThreshold: threshold });
        const movement = createMockMovement({ 
          itemId: item.id, 
          quantity: threshold, 
          newQuantity: threshold 
        });
        
        const enriched = enrichItemsWithQuantities([item], [movement]);
        // quantity <= threshold means low stock
        expect(enriched[0].isLowStock).toBe(true);
      }
    });

    test('should correctly count low stock items in health metrics', () => {
      const items = [
        createMockItem({ reorderThreshold: 10 }),
        createMockItem({ reorderThreshold: 5 }),
        createMockItem({ reorderThreshold: 15 }),
      ];
      
      const movements = [
        createMockMovement({ itemId: items[0].id, quantity: 5, newQuantity: 5 }),   // Low stock
        createMockMovement({ itemId: items[1].id, quantity: 10, newQuantity: 10 }), // Not low stock
        createMockMovement({ itemId: items[2].id, quantity: 15, newQuantity: 15 }), // Low stock (equals threshold)
      ];
      
      const health = calculateInventoryHealth(items, movements);
      expect(health.lowStockCount).toBe(2);
    });
  });

  describe('Lifecycle Status Effect on Low Stock', () => {
    test('should still detect low stock regardless of lifecycle status', () => {
      const statuses = ['active', 'reserved', 'damaged', 'expired', 'archived', 'disposed'] as const;
      
      statuses.forEach(status => {
        const item = createMockItem({ 
          reorderThreshold: 10, 
          lifecycleStatus: status 
        });
        const movement = createMockMovement({ 
          itemId: item.id, 
          quantity: 5, 
          newQuantity: 5 
        });
        
        const enriched = enrichItemsWithQuantities([item], [movement]);
        expect(enriched[0].isLowStock).toBe(true);
      });
    });

    test('should include non-active items in low stock filter when applicable', () => {
      const activeItem = createMockItem({ 
        reorderThreshold: 10, 
        lifecycleStatus: 'active' 
      });
      const reservedItem = createMockItem({ 
        reorderThreshold: 10, 
        lifecycleStatus: 'reserved' 
      });
      
      const movements = [
        createMockMovement({ itemId: activeItem.id, quantity: 5, newQuantity: 5 }),
        createMockMovement({ itemId: reservedItem.id, quantity: 3, newQuantity: 3 }),
      ];
      
      const enriched = enrichItemsWithQuantities([activeItem, reservedItem], movements);
      const lowStockItems = enriched.filter(i => i.isLowStock);
      
      expect(lowStockItems).toHaveLength(2);
    });
  });
});

describe('Transfer Movement Tests (Req 3, 5, 12, 15)', () => {
  test('transfer movement should not change quantity', () => {
    const itemId = generateUUID();
    const fromLocationId = generateUUID();
    const toLocationId = generateUUID();
    
    const item = createMockItem({ id: itemId, locationId: fromLocationId });
    
    // Initial inbound
    const inbound = createMockMovement({
      itemId,
      type: 'inbound',
      quantity: 100,
      newQuantity: 100,
    });
    
    // Transfer (should maintain quantity)
    const transfer = createMockMovement({
      itemId,
      type: 'transfer',
      quantity: 0,
      previousQuantity: 100,
      newQuantity: 100,
      fromLocationId,
      toLocationId,
    });
    
    const enriched = enrichItemsWithQuantities([item], [inbound, transfer]);
    expect(enriched[0].quantity).toBe(100);
  });

  test('correction movement should adjust quantity', () => {
    const itemId = generateUUID();
    const item = createMockItem({ id: itemId });
    
    // Initial inbound (older timestamp)
    const inbound = createMockMovement({
      itemId,
      type: 'inbound',
      quantity: 100,
      newQuantity: 100,
      timestamp: '2024-01-01T00:00:00Z', // Earlier
    });
    
    // Correction (inventory count found discrepancy) - later timestamp
    const correction = createMockMovement({
      itemId,
      type: 'correction',
      quantity: -10, // Reduce by 10
      previousQuantity: 100,
      newQuantity: 90,
      reason: 'Physical count discrepancy',
      timestamp: '2024-01-02T00:00:00Z', // Later - should be picked as latest
    });
    
    const enriched = enrichItemsWithQuantities([item], [inbound, correction]);
    expect(enriched[0].quantity).toBe(90);
  });
});
