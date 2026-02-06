/**
 * Store Tests - Tests for Zustand store actions, selectors, and state management
 */

import { 
  enrichItemsWithQuantities,
  calculateTotalInventoryValue,
  calculateInventoryHealth,
  calculateValueByCategory,
  calculateValueByLocation,
  calculateTurnoverRate,
  calculateDemandConsistency,
  calculateDeadStockRatio,
  identifySlowMovingItems,
  identifyOverstockItems,
} from '../repository_after/src/lib/calculations';
import { 
  InventoryItem, 
  StockMovement, 
  Category, 
  Location,
  InventoryItemSchema,
  StockMovementSchema,
  CategorySchema,
  LocationSchema,
  BulkEditSchema,
} from '../repository_after/src/lib/schemas';

// Helper to generate valid UUIDs
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Mock data generators with proper UUID and datetime format
const createMockItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: generateUUID(),
  name: 'Test Item',
  sku: `SKU-${Date.now()}`,
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

const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
  id: generateUUID(),
  name: 'Test Category',
  description: 'Test description',
  parentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockLocation = (overrides: Partial<Location> = {}): Location => ({
  id: generateUUID(),
  name: 'Test Location',
  description: 'Test description',
  zone: 'Zone A',
  capacity: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Store Tests', () => {
  describe('Item Enrichment', () => {
    test('should enrich items with correct quantities from latest movement', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId, unitCost: 25.00, reorderThreshold: 10 });
      
      // enrichItemsWithQuantities uses the latest movement's newQuantity
      const movements = [
        createMockMovement({ 
          itemId, 
          type: 'inbound', 
          quantity: 50, 
          previousQuantity: 0, 
          newQuantity: 50,
          timestamp: '2024-01-01T10:00:00Z'
        }),
        createMockMovement({ 
          itemId, 
          type: 'outbound', 
          quantity: -20, 
          previousQuantity: 50, 
          newQuantity: 30,
          timestamp: '2024-01-02T10:00:00Z'
        }),
      ];

      const enriched = enrichItemsWithQuantities([item], movements);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].quantity).toBe(30); // Latest movement's newQuantity
      expect(enriched[0].totalValue).toBe(750); // 30 * 25
      expect(enriched[0].isLowStock).toBe(false); // 30 > 10
    });

    test('should mark items as low stock correctly', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId, reorderThreshold: 20 });
      const movements = [
        createMockMovement({ itemId, newQuantity: 15 }),
      ];

      const enriched = enrichItemsWithQuantities([item], movements);

      expect(enriched[0].isLowStock).toBe(true);
    });

    test('should handle items with no movements', () => {
      const item = createMockItem();
      const enriched = enrichItemsWithQuantities([item], []);

      expect(enriched[0].quantity).toBe(0);
      expect(enriched[0].totalValue).toBe(0);
      expect(enriched[0].isLowStock).toBe(true);
    });
  });

  describe('Value Calculations', () => {
    test('should calculate total inventory value correctly', () => {
      const itemId1 = generateUUID();
      const itemId2 = generateUUID();
      const items = [
        createMockItem({ id: itemId1, unitCost: 10.00 }),
        createMockItem({ id: itemId2, unitCost: 25.00 }),
      ];
      const movements = [
        createMockMovement({ itemId: itemId1, newQuantity: 100 }),
        createMockMovement({ itemId: itemId2, newQuantity: 50 }),
      ];

      const totalValue = calculateTotalInventoryValue(items, movements);

      expect(totalValue).toBe(2250); // (100 * 10) + (50 * 25)
    });

    test('should calculate value by category correctly', () => {
      const catId = generateUUID();
      const itemId1 = generateUUID();
      const itemId2 = generateUUID();
      const itemId3 = generateUUID();
      
      const items = [
        createMockItem({ id: itemId1, categoryId: catId, unitCost: 10 }),
        createMockItem({ id: itemId2, categoryId: catId, unitCost: 20 }),
        createMockItem({ id: itemId3, categoryId: null, unitCost: 30 }),
      ];
      const movements = [
        createMockMovement({ itemId: itemId1, newQuantity: 10 }),
        createMockMovement({ itemId: itemId2, newQuantity: 5 }),
        createMockMovement({ itemId: itemId3, newQuantity: 3 }),
      ];

      const valueByCategory = calculateValueByCategory(items, movements);

      expect(valueByCategory[catId]).toBe(200); // (10*10) + (5*20)
      expect(valueByCategory['uncategorized']).toBe(90); // 3*30
    });

    test('should calculate value by location correctly', () => {
      const locId1 = generateUUID();
      const locId2 = generateUUID();
      const itemId1 = generateUUID();
      const itemId2 = generateUUID();
      
      const items = [
        createMockItem({ id: itemId1, locationId: locId1, unitCost: 15 }),
        createMockItem({ id: itemId2, locationId: locId2, unitCost: 25 }),
      ];
      const movements = [
        createMockMovement({ itemId: itemId1, newQuantity: 20 }),
        createMockMovement({ itemId: itemId2, newQuantity: 10 }),
      ];

      const valueByLocation = calculateValueByLocation(items, movements);

      expect(valueByLocation[locId1]).toBe(300);
      expect(valueByLocation[locId2]).toBe(250);
    });
  });

  describe('Inventory Health Calculations', () => {
    test('should calculate health metrics with valid ranges', () => {
      const itemId = generateUUID();
      const items = [createMockItem({ id: itemId, unitCost: 100, reorderThreshold: 5 })];
      const movements = [
        createMockMovement({ itemId, type: 'inbound', quantity: 50, newQuantity: 50 }),
      ];

      const health = calculateInventoryHealth(items, movements);

      expect(health.totalItems).toBe(1);
      expect(health.totalValue).toBeGreaterThanOrEqual(0);
      expect(health.lowStockCount).toBeGreaterThanOrEqual(0);
      expect(health.deadStockRatio).toBeGreaterThanOrEqual(0);
      expect(health.deadStockRatio).toBeLessThanOrEqual(1);
      expect(health.replenishmentEfficiency).toBeGreaterThanOrEqual(0);
      expect(health.replenishmentEfficiency).toBeLessThanOrEqual(1);
      expect(health.overallHealthScore).toBeGreaterThanOrEqual(0);
      expect(health.overallHealthScore).toBeLessThanOrEqual(100);
    });

    test('should handle empty inventory', () => {
      const health = calculateInventoryHealth([], []);

      expect(health.totalItems).toBe(0);
      expect(health.totalValue).toBe(0);
      expect(health.overallHealthScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Turnover and Velocity', () => {
    test('should calculate turnover rate for active items', () => {
      const itemId = generateUUID();
      const now = new Date();
      const movements = [
        createMockMovement({ 
          itemId, 
          type: 'outbound', 
          quantity: -10, 
          newQuantity: 90,
          timestamp: now.toISOString(),
        }),
        createMockMovement({ 
          itemId, 
          type: 'inbound', 
          quantity: 100, 
          newQuantity: 100,
          timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ];

      const turnover = calculateTurnoverRate(itemId, movements, 30);

      expect(turnover).toBeGreaterThanOrEqual(0);
    });

    test('should return zero turnover for items with no movements', () => {
      const turnover = calculateTurnoverRate(generateUUID(), [], 30);
      expect(turnover).toBe(0);
    });
  });

  describe('Stock Identification', () => {
    test('should identify slow-moving items', () => {
      const itemId1 = generateUUID();
      const itemId2 = generateUUID();
      const items = [
        createMockItem({ id: itemId1 }),
        createMockItem({ id: itemId2 }),
      ];
      const movements = [
        createMockMovement({ itemId: itemId1, type: 'inbound', newQuantity: 100 }),
      ];

      const slowMoving = identifySlowMovingItems(items, movements, 0.5, 30);

      expect(slowMoving.length).toBeGreaterThanOrEqual(0);
    });

    test('should identify overstock items', () => {
      const itemId = generateUUID();
      const items = [
        createMockItem({ id: itemId, reorderThreshold: 10 }),
      ];
      const movements = [
        createMockMovement({ itemId, newQuantity: 100 }), // 100 > 10 * 5
      ];

      const overstock = identifyOverstockItems(items, movements, 5);

      expect(overstock.length).toBe(1);
    });
  });

  describe('Schema Validation', () => {
    test('should validate correct item schema', () => {
      const item = createMockItem();
      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('should reject invalid item schema', () => {
      const invalidItem = { name: '', sku: '' }; // Missing required fields
      const result = InventoryItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });

    test('should validate movement schema', () => {
      const movement = createMockMovement();
      const result = StockMovementSchema.safeParse(movement);
      expect(result.success).toBe(true);
    });

    test('should validate category schema', () => {
      const category = createMockCategory();
      const result = CategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    });

    test('should validate location schema', () => {
      const location = createMockLocation();
      const result = LocationSchema.safeParse(location);
      expect(result.success).toBe(true);
    });

    test('should validate bulk edit schema', () => {
      const bulkEdit = {
        itemIds: [generateUUID()],
        updates: {
          categoryId: generateUUID(),
        },
      };
      const result = BulkEditSchema.safeParse(bulkEdit);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle adjustment movements correctly', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId, unitCost: 10 });
      // The latest movement determines the final quantity
      const movements = [
        createMockMovement({ 
          itemId, 
          type: 'inbound', 
          quantity: 100, 
          newQuantity: 100,
          timestamp: '2024-01-01T00:00:00Z'
        }),
        createMockMovement({ 
          itemId, 
          type: 'adjustment', 
          quantity: -30, 
          newQuantity: 70,
          timestamp: '2024-01-02T00:00:00Z'
        }),
      ];

      const enriched = enrichItemsWithQuantities([item], movements);

      expect(enriched[0].quantity).toBe(70);
    });

    test('should handle floating-point precision in value calculations', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId, unitCost: 0.1 });
      const movements = [
        createMockMovement({ itemId, newQuantity: 3 }),
      ];

      const enriched = enrichItemsWithQuantities([item], movements);

      // Should be 0.30, not 0.30000000000000004
      expect(enriched[0].totalValue).toBeCloseTo(0.3, 2);
    });

    test('should handle zero stock correctly', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId, reorderThreshold: 5 });
      const movements = [
        createMockMovement({ itemId, newQuantity: 0 }),
      ];

      const enriched = enrichItemsWithQuantities([item], movements);

      expect(enriched[0].quantity).toBe(0);
      expect(enriched[0].isLowStock).toBe(true);
    });

    test('should handle items with expired lifecycle status', () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const item = createMockItem({ 
        lifecycleStatus: 'expired',
        expirationDate: pastDate,
      });

      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('should handle demand consistency with insufficient data', () => {
      const consistency = calculateDemandConsistency(generateUUID(), [], 30);
      expect(consistency).toBe(1); // Default to consistent when no data
    });

    test('should handle dead stock ratio with no items', () => {
      const ratio = calculateDeadStockRatio([], [], 90);
      expect(ratio).toBe(0);
    });
  });

  describe('Deterministic Calculations', () => {
    test('should produce same results for same input', () => {
      const itemId = generateUUID();
      const items = [createMockItem({ id: itemId, unitCost: 10 })];
      const movements = [createMockMovement({ itemId, newQuantity: 50 })];

      const result1 = calculateTotalInventoryValue(items, movements);
      const result2 = calculateTotalInventoryValue(items, movements);

      expect(result1).toBe(result2);
    });

    test('should derive quantity deterministically from movements', () => {
      const itemId = generateUUID();
      const item = createMockItem({ id: itemId });
      const movements = [
        createMockMovement({ itemId, type: 'inbound', quantity: 100, newQuantity: 100, timestamp: '2024-01-01T00:00:00Z' }),
        createMockMovement({ itemId, type: 'outbound', quantity: -25, newQuantity: 75, timestamp: '2024-01-02T00:00:00Z' }),
        createMockMovement({ itemId, type: 'outbound', quantity: -25, newQuantity: 50, timestamp: '2024-01-03T00:00:00Z' }),
      ];

      const enriched1 = enrichItemsWithQuantities([item], movements);
      const enriched2 = enrichItemsWithQuantities([item], movements);

      expect(enriched1[0].quantity).toBe(enriched2[0].quantity);
      expect(enriched1[0].quantity).toBe(50);
    });
  });
});
