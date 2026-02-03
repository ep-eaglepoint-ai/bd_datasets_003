import { 
  InventoryItemSchema,
  CategorySchema,
  LocationSchema,
  StockMovementSchema,
  AuditLogSchema,
  ValuationSnapshotSchema,
  InventoryHealthSchema,
  ExportDataSchema,
  BulkEditSchema,
  FilterSchema,
  LifecycleStatus,
  MovementType,
} from '../repository_after/src/lib/schemas';

// Helper to generate valid UUIDs for tests
const uuid1 = '550e8400-e29b-41d4-a716-446655440001';
const uuid2 = '550e8400-e29b-41d4-a716-446655440002';
const uuid3 = '550e8400-e29b-41d4-a716-446655440003';
const uuid4 = '550e8400-e29b-41d4-a716-446655440004';
const uuid5 = '550e8400-e29b-41d4-a716-446655440005';
const uuidCat = '550e8400-e29b-41d4-a716-446655440010';
const uuidLoc = '550e8400-e29b-41d4-a716-446655440020';
const uuidMov = '550e8400-e29b-41d4-a716-446655440030';
const uuidLog = '550e8400-e29b-41d4-a716-446655440040';

describe('Schema Validation Tests', () => {
  describe('InventoryItemSchema', () => {
    test('should validate a valid inventory item', () => {
      const validItem = {
        id: uuid1,
        sku: 'SKU-001',
        name: 'Test Item',
        categoryId: uuidCat,
        locationId: uuidLoc,
        unitCost: 25.50,
        reorderThreshold: 10,
        lifecycleStatus: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = InventoryItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });
    
    test('should reject item with negative unit cost', () => {
      const invalidItem = {
        id: uuid1,
        sku: 'SKU-001',
        name: 'Test Item',
        categoryId: null,
        locationId: null,
        unitCost: -10,
        reorderThreshold: 10,
        lifecycleStatus: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = InventoryItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });
    
    test('should reject item with empty name', () => {
      const invalidItem = {
        id: uuid1,
        sku: 'SKU-001',
        name: '',
        categoryId: null,
        locationId: null,
        unitCost: 10,
        reorderThreshold: 10,
        lifecycleStatus: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = InventoryItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    });
    
    test('should accept item with optional fields as null', () => {
      const validItem = {
        id: uuid1,
        sku: 'SKU-001',
        name: 'Test Item',
        categoryId: null,
        locationId: null,
        unitCost: 25.50,
        reorderThreshold: 10,
        lifecycleStatus: 'active',
        expirationDate: null,
        supplierNotes: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = InventoryItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });
  });
  
  describe('CategorySchema', () => {
    test('should validate a valid category', () => {
      const validCategory = {
        id: uuidCat,
        name: 'Electronics',
        description: 'Electronic items',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = CategorySchema.safeParse(validCategory);
      expect(result.success).toBe(true);
    });
    
    test('should reject category with empty name', () => {
      const invalidCategory = {
        id: uuidCat,
        name: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = CategorySchema.safeParse(invalidCategory);
      expect(result.success).toBe(false);
    });
  });
  
  describe('LocationSchema', () => {
    test('should validate a valid location', () => {
      const validLocation = {
        id: uuidLoc,
        name: 'Warehouse A',
        zone: 'Zone 1',
        capacity: 1000,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = LocationSchema.safeParse(validLocation);
      expect(result.success).toBe(true);
    });
    
    test('should reject location with negative capacity', () => {
      const invalidLocation = {
        id: uuidLoc,
        name: 'Warehouse A',
        capacity: -100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const result = LocationSchema.safeParse(invalidLocation);
      expect(result.success).toBe(false);
    });
  });
  
  describe('StockMovementSchema', () => {
    test('should validate a valid stock movement', () => {
      const validMovement = {
        id: uuidMov,
        itemId: uuid1,
        type: 'inbound',
        quantity: 50,
        previousQuantity: 100,
        newQuantity: 150,
        fromLocationId: null,
        toLocationId: uuidLoc,
        reason: 'Purchase order #123',
        timestamp: '2024-01-01T00:00:00Z',
      };
      
      const result = StockMovementSchema.safeParse(validMovement);
      expect(result.success).toBe(true);
    });
    
    test('should validate outbound movement with negative quantity', () => {
      const validMovement = {
        id: uuidMov,
        itemId: uuid1,
        type: 'outbound',
        quantity: -25,
        previousQuantity: 100,
        newQuantity: 75,
        fromLocationId: uuidLoc,
        toLocationId: null,
        timestamp: '2024-01-01T00:00:00Z',
      };
      
      const result = StockMovementSchema.safeParse(validMovement);
      expect(result.success).toBe(true);
    });
    
    test('should reject movement with invalid type', () => {
      const invalidMovement = {
        id: uuidMov,
        itemId: uuid1,
        type: 'invalid_type',
        quantity: 50,
        previousQuantity: 100,
        newQuantity: 150,
        fromLocationId: null,
        toLocationId: null,
        timestamp: '2024-01-01T00:00:00Z',
      };
      
      const result = StockMovementSchema.safeParse(invalidMovement);
      expect(result.success).toBe(false);
    });
  });
  
  describe('LifecycleStatus', () => {
    test('should accept all valid lifecycle statuses', () => {
      const validStatuses = ['active', 'reserved', 'damaged', 'expired', 'archived', 'disposed'];
      
      validStatuses.forEach(status => {
        const result = LifecycleStatus.safeParse(status);
        expect(result.success).toBe(true);
      });
    });
    
    test('should reject invalid lifecycle status', () => {
      const result = LifecycleStatus.safeParse('unknown');
      expect(result.success).toBe(false);
    });
  });
  
  describe('MovementType', () => {
    test('should accept all valid movement types', () => {
      const validTypes = ['inbound', 'outbound', 'adjustment', 'transfer', 'correction'];
      
      validTypes.forEach(type => {
        const result = MovementType.safeParse(type);
        expect(result.success).toBe(true);
      });
    });
    
    test('should reject invalid movement type', () => {
      const result = MovementType.safeParse('sale');
      expect(result.success).toBe(false);
    });
  });
  
  describe('AuditLogSchema', () => {
    test('should validate a valid audit log', () => {
      const validLog = {
        id: uuidLog,
        entityType: 'item',
        entityId: uuid1,
        action: 'create',
        changes: { name: 'New Item' },
        timestamp: '2024-01-01T00:00:00Z',
      };
      
      const result = AuditLogSchema.safeParse(validLog);
      expect(result.success).toBe(true);
    });
    
    test('should reject audit log with invalid action', () => {
      const invalidLog = {
        id: uuidLog,
        entityType: 'item',
        entityId: uuid1,
        action: 'modify',
        changes: {},
        timestamp: '2024-01-01T00:00:00Z',
      };
      
      const result = AuditLogSchema.safeParse(invalidLog);
      expect(result.success).toBe(false);
    });
  });
  
  describe('InventoryHealthSchema', () => {
    test('should validate valid inventory health metrics', () => {
      const validHealth = {
        totalItems: 100,
        totalValue: 50000,
        lowStockCount: 5,
        overallHealthScore: 85,
        turnoverRate: 2.5,
        stockAgingDays: 30,
        deadStockRatio: 0.05,
        demandConsistency: 0.9,
        replenishmentEfficiency: 0.85,
      };
      
      const result = InventoryHealthSchema.safeParse(validHealth);
      expect(result.success).toBe(true);
    });
    
    test('should reject health score outside valid range', () => {
      const invalidHealth = {
        totalItems: 100,
        totalValue: 50000,
        lowStockCount: 5,
        overallHealthScore: 150,
        turnoverRate: 2.5,
        stockAgingDays: 30,
        deadStockRatio: 0.05,
        demandConsistency: 0.9,
        replenishmentEfficiency: 0.85,
      };
      
      const result = InventoryHealthSchema.safeParse(invalidHealth);
      expect(result.success).toBe(false);
    });
  });
  
  describe('FilterSchema', () => {
    test('should validate valid filter options', () => {
      const validFilter = {
        search: 'test',
        categoryId: uuidCat,
        locationId: uuidLoc,
        lifecycleStatus: 'active',
        lowStockOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
      };
      
      const result = FilterSchema.safeParse(validFilter);
      expect(result.success).toBe(true);
    });
    
    test('should accept empty filter', () => {
      const emptyFilter = {};
      
      const result = FilterSchema.safeParse(emptyFilter);
      expect(result.success).toBe(true);
    });
    
    test('should reject invalid sort order', () => {
      const invalidFilter = {
        sortOrder: 'ascending',
      };
      
      const result = FilterSchema.safeParse(invalidFilter);
      expect(result.success).toBe(false);
    });
  });
  
  describe('BulkEditSchema', () => {
    test('should validate valid bulk edit', () => {
      const validBulkEdit = {
        itemIds: [uuid1, uuid2, uuid3],
        updates: {
          categoryId: uuidCat,
          lifecycleStatus: 'archived',
        },
      };
      
      const result = BulkEditSchema.safeParse(validBulkEdit);
      expect(result.success).toBe(true);
    });
    
    test('should reject bulk edit with empty item array', () => {
      const invalidBulkEdit = {
        itemIds: [],
        updates: { categoryId: uuidCat },
      };
      
      const result = BulkEditSchema.safeParse(invalidBulkEdit);
      expect(result.success).toBe(false);
    });
  });
  
  describe('ExportDataSchema', () => {
    test('should validate valid export data', () => {
      const validExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00Z',
        items: [],
        categories: [],
        locations: [],
        movements: [],
        auditLogs: [],
      };
      
      const result = ExportDataSchema.safeParse(validExport);
      expect(result.success).toBe(true);
    });
    
    test('should reject export data without version', () => {
      const invalidExport = {
        exportedAt: '2024-01-01T00:00:00Z',
        items: [],
        categories: [],
        locations: [],
        movements: [],
        auditLogs: [],
      };
      
      const result = ExportDataSchema.safeParse(invalidExport);
      expect(result.success).toBe(false);
    });
  });
});
