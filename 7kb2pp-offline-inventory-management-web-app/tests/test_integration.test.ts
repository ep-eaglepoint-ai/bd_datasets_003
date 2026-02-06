/**
 * Integration Tests - Tests for bulk operations, audit logging, data export, and edge cases
 */

import {
  InventoryItemSchema,
  StockMovementSchema,
  CategorySchema,
  LocationSchema,
  AuditLogSchema,
  ExportDataSchema,
  BulkEditSchema,
  FilterSchema,
  InventoryItem,
  StockMovement,
  Category,
  Location,
  AuditLog,
} from '../repository_after/src/lib/schemas';
import {
  enrichItemsWithQuantities,
  calculateTotalInventoryValue,
  calculateInventoryHealth,
  calculateValueByCategory,
  generateStockHistoryData,
  generateValuationHistoryData,
} from '../repository_after/src/lib/calculations';

// Helper to generate valid UUIDs
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const createTestItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
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

const createTestMovement = (overrides: Partial<StockMovement> = {}): StockMovement => ({
  id: generateUUID(),
  itemId: generateUUID(),
  type: 'inbound',
  quantity: 10,
  previousQuantity: 0,
  newQuantity: 10,
  fromLocationId: null,
  toLocationId: null,
  reason: 'Test',
  timestamp: new Date().toISOString(),
  ...overrides,
});

const createTestCategory = (overrides: Partial<Category> = {}): Category => ({
  id: generateUUID(),
  name: 'Test Category',
  description: 'Test',
  parentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createTestLocation = (overrides: Partial<Location> = {}): Location => ({
  id: generateUUID(),
  name: 'Test Location',
  description: 'Test',
  zone: 'A',
  capacity: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createTestAuditLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: generateUUID(),
  entityType: 'item',
  entityId: generateUUID(),
  action: 'create',
  changes: { name: 'Test' },
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('Integration Tests', () => {
  describe('Audit Log Schema', () => {
    test('should validate audit log for item creation', () => {
      const auditLog = createTestAuditLog({
        entityType: 'item',
        action: 'create',
        changes: { name: 'New Item', sku: 'SKU-001' },
      });

      const result = AuditLogSchema.safeParse(auditLog);
      expect(result.success).toBe(true);
    });

    test('should validate audit log for item update', () => {
      const auditLog = createTestAuditLog({
        entityType: 'item',
        action: 'update',
        changes: { before: { name: 'Old' }, after: { name: 'New' } },
      });

      const result = AuditLogSchema.safeParse(auditLog);
      expect(result.success).toBe(true);
    });

    test('should validate audit log for movement creation', () => {
      const auditLog = createTestAuditLog({
        entityType: 'movement',
        action: 'create',
        changes: {
          type: 'inbound',
          quantity: 100,
          itemName: 'Test Item',
        },
      });

      const result = AuditLogSchema.safeParse(auditLog);
      expect(result.success).toBe(true);
    });

    test('should validate audit log for item deletion', () => {
      const auditLog = createTestAuditLog({
        entityType: 'item',
        action: 'delete',
        changes: { deletedItem: { name: 'Deleted Item' } },
      });

      const result = AuditLogSchema.safeParse(auditLog);
      expect(result.success).toBe(true);
    });
  });

  describe('Bulk Operations Schema', () => {
    test('should validate bulk edit with category update', () => {
      const bulkEdit = {
        itemIds: [generateUUID(), generateUUID()],
        updates: {
          categoryId: generateUUID(),
        },
      };

      const result = BulkEditSchema.safeParse(bulkEdit);
      expect(result.success).toBe(true);
    });

    test('should validate bulk edit with location update', () => {
      const bulkEdit = {
        itemIds: [generateUUID()],
        updates: {
          locationId: generateUUID(),
        },
      };

      const result = BulkEditSchema.safeParse(bulkEdit);
      expect(result.success).toBe(true);
    });

    test('should validate bulk edit with lifecycle status update', () => {
      const bulkEdit = {
        itemIds: [generateUUID(), generateUUID(), generateUUID()],
        updates: {
          lifecycleStatus: 'archived' as const,
        },
      };

      const result = BulkEditSchema.safeParse(bulkEdit);
      expect(result.success).toBe(true);
    });

    test('should reject bulk edit with empty item IDs', () => {
      const bulkEdit = {
        itemIds: [],
        updates: { categoryId: generateUUID() },
      };

      const result = BulkEditSchema.safeParse(bulkEdit);
      expect(result.success).toBe(false);
    });
  });

  describe('Export Data Schema', () => {
    test('should validate complete export data', () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        items: [createTestItem()],
        categories: [createTestCategory()],
        locations: [createTestLocation()],
        movements: [createTestMovement()],
        auditLogs: [createTestAuditLog()],
      };

      const result = ExportDataSchema.safeParse(exportData);
      expect(result.success).toBe(true);
    });

    test('should validate empty export data', () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        items: [],
        categories: [],
        locations: [],
        movements: [],
        auditLogs: [],
      };

      const result = ExportDataSchema.safeParse(exportData);
      expect(result.success).toBe(true);
    });
  });

  describe('Filter Schema', () => {
    test('should validate search filter', () => {
      const filter = { search: 'test item' };
      const result = FilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test('should validate compound filter', () => {
      const filter = {
        search: 'widget',
        categoryId: generateUUID(),
        locationId: generateUUID(),
        lifecycleStatus: 'active' as const,
        lowStockOnly: true,
        sortBy: 'name' as const,
        sortOrder: 'asc' as const,
      };

      const result = FilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });

    test('should validate sort options', () => {
      const filter = {
        sortBy: 'totalValue' as const,
        sortOrder: 'desc' as const,
      };

      const result = FilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });
  });

  describe('Stock History Generation', () => {
    test('should generate stock history for item with movements', () => {
      const itemId = generateUUID();
      const now = new Date();
      const movements = [
        createTestMovement({
          itemId,
          type: 'inbound',
          quantity: 100,
          newQuantity: 100,
          timestamp: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        createTestMovement({
          itemId,
          type: 'outbound',
          quantity: -30,
          newQuantity: 70,
          timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ];

      const history = generateStockHistoryData(itemId, movements, 30);

      expect(history.length).toBe(30);
      expect(history[history.length - 1].quantity).toBe(70);
    });

    test('should handle item with no movements', () => {
      const history = generateStockHistoryData(generateUUID(), [], 30);

      expect(history.length).toBe(30);
      history.forEach(entry => {
        expect(entry.quantity).toBe(0);
      });
    });
  });

  describe('Valuation History Generation', () => {
    test('should generate valuation history', () => {
      const itemId = generateUUID();
      const items = [createTestItem({ id: itemId, unitCost: 50 })];
      const movements = [
        createTestMovement({
          itemId,
          newQuantity: 20,
          timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ];

      const history = generateValuationHistoryData(items, movements, 30);

      expect(history.length).toBe(30);
      expect(history[history.length - 1].totalValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Lifecycle Status Handling', () => {
    test('should accept all valid lifecycle statuses', () => {
      const statuses = ['active', 'reserved', 'damaged', 'expired', 'archived', 'disposed'] as const;

      statuses.forEach(status => {
        const item = createTestItem({ lifecycleStatus: status });
        const result = InventoryItemSchema.safeParse(item);
        expect(result.success).toBe(true);
      });
    });

    test('should reject invalid lifecycle status', () => {
      const item = { ...createTestItem(), lifecycleStatus: 'invalid' };
      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(false);
    });
  });

  describe('Movement Type Handling', () => {
    test('should accept all valid movement types', () => {
      const types = ['inbound', 'outbound', 'transfer', 'adjustment', 'correction'] as const;

      types.forEach(type => {
        const movement = createTestMovement({ type });
        const result = StockMovementSchema.safeParse(movement);
        expect(result.success).toBe(true);
      });
    });

    test('should handle negative quantities for outbound', () => {
      const movement = createTestMovement({
        type: 'outbound',
        quantity: -50,
        previousQuantity: 100,
        newQuantity: 50,
      });

      const result = StockMovementSchema.safeParse(movement);
      expect(result.success).toBe(true);
    });
  });

  describe('Category Hierarchy', () => {
    test('should allow parent category reference', () => {
      const parentId = generateUUID();
      const category = createTestCategory({ parentId });

      const result = CategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    });

    test('should allow null parent for root categories', () => {
      const category = createTestCategory({ parentId: null });

      const result = CategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    });
  });

  describe('Location Capacity', () => {
    test('should accept location with capacity', () => {
      const location = createTestLocation({ capacity: 5000 });

      const result = LocationSchema.safeParse(location);
      expect(result.success).toBe(true);
    });

    test('should accept location without capacity', () => {
      const location = createTestLocation({ capacity: undefined });

      const result = LocationSchema.safeParse(location);
      expect(result.success).toBe(true);
    });

    test('should reject negative capacity', () => {
      const location = { ...createTestLocation(), capacity: -100 };

      const result = LocationSchema.safeParse(location);
      expect(result.success).toBe(false);
    });
  });

  describe('Expiration Date Handling', () => {
    test('should accept item with future expiration date', () => {
      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const item = createTestItem({ expirationDate: futureDate });

      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('should accept item with past expiration date (expired)', () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const item = createTestItem({ expirationDate: pastDate });

      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    test('should accept item without expiration date', () => {
      const item = createTestItem({ expirationDate: null });

      const result = InventoryItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    });
  });

  describe('Referential Integrity Simulation', () => {
    test('should handle deleted category gracefully', () => {
      const deletedCategoryId = generateUUID();
      const itemId = generateUUID();
      const items = [
        createTestItem({ id: itemId, categoryId: deletedCategoryId }),
      ];
      const movements = [
        createTestMovement({ itemId, newQuantity: 10 }),
      ];

      const valueByCategory = calculateValueByCategory(items, movements);

      // Should still calculate value even with non-existent category
      expect(valueByCategory[deletedCategoryId]).toBeDefined();
    });

    test('should handle orphaned movements in calculations', () => {
      const items: InventoryItem[] = [];
      const movements = [
        createTestMovement({ itemId: generateUUID(), newQuantity: 100 }),
      ];

      // Should not throw when calculating with orphaned movements
      const health = calculateInventoryHealth(items, movements);
      expect(health.totalItems).toBe(0);
    });
  });

  describe('Large Dataset Handling', () => {
    test('should handle many items efficiently', () => {
      const itemCount = 100;
      const items = Array.from({ length: itemCount }, (_, i) => {
        const id = generateUUID();
        return createTestItem({ id, unitCost: 10 + i });
      });
      const movements = items.map(item =>
        createTestMovement({ itemId: item.id, newQuantity: 50 })
      );

      const startTime = Date.now();
      const enriched = enrichItemsWithQuantities(items, movements);
      const duration = Date.now() - startTime;

      expect(enriched.length).toBe(itemCount);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('should calculate health for large inventory', () => {
      const itemCount = 50;
      const items = Array.from({ length: itemCount }, () => {
        const id = generateUUID();
        return createTestItem({ id });
      });
      const movements = items.flatMap(item => [
        createTestMovement({ itemId: item.id, type: 'inbound', newQuantity: 100 }),
        createTestMovement({ itemId: item.id, type: 'outbound', quantity: -20, newQuantity: 80 }),
      ]);

      const health = calculateInventoryHealth(items, movements);

      expect(health.totalItems).toBe(itemCount);
      expect(health.overallHealthScore).toBeGreaterThanOrEqual(0);
      expect(health.overallHealthScore).toBeLessThanOrEqual(100);
    });
  });
});
