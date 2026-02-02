import {
  calculateItemQuantity,
  calculateItemValue,
  enrichItemsWithQuantities,
  calculateTotalInventoryValue,
  calculateInventoryHealth,
} from '@/lib/calculations';
import { InventoryItem, StockMovement } from '@/lib/schemas';

describe('Calculation Tests', () => {
  const mockItem: InventoryItem = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Item',
    sku: 'SKU-001',
    categoryId: '550e8400-e29b-41d4-a716-446655440010',
    locationId: '550e8400-e29b-41d4-a716-446655440020',
    unitCost: 25.00,
    reorderThreshold: 10,
    lifecycleStatus: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockMovements: StockMovement[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440100',
      itemId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'inbound',
      quantity: 100,
      previousQuantity: 0,
      newQuantity: 100,
      fromLocationId: null,
      toLocationId: '550e8400-e29b-41d4-a716-446655440020',
      timestamp: '2024-01-01T10:00:00Z',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440101',
      itemId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'outbound',
      quantity: -30,
      previousQuantity: 100,
      newQuantity: 70,
      fromLocationId: '550e8400-e29b-41d4-a716-446655440020',
      toLocationId: null,
      timestamp: '2024-01-15T14:00:00Z',
    },
  ];

  describe('calculateItemQuantity', () => {
    test('should calculate quantity from movements', () => {
      const quantity = calculateItemQuantity(mockItem.id, mockMovements);
      expect(quantity).toBe(70);
    });

    test('should return 0 for item with no movements', () => {
      const quantity = calculateItemQuantity('nonexistent-id', mockMovements);
      expect(quantity).toBe(0);
    });

    test('should handle empty movements array', () => {
      const quantity = calculateItemQuantity(mockItem.id, []);
      expect(quantity).toBe(0);
    });
  });

  describe('calculateItemValue', () => {
    test('should calculate total value correctly', () => {
      const value = calculateItemValue(70, 25.00);
      expect(value).toBe(1750.00);
    });

    test('should handle zero quantity', () => {
      const value = calculateItemValue(0, 25.00);
      expect(value).toBe(0);
    });

    test('should handle zero unit cost', () => {
      const value = calculateItemValue(100, 0);
      expect(value).toBe(0);
    });
  });

  describe('enrichItemsWithQuantities', () => {
    test('should enrich items with quantity and value', () => {
      const enriched = enrichItemsWithQuantities([mockItem], mockMovements);
      
      expect(enriched).toHaveLength(1);
      expect(enriched[0].quantity).toBe(70);
      expect(enriched[0].totalValue).toBe(1750.00);
      expect(enriched[0].isLowStock).toBe(false);
    });

    test('should flag low stock items', () => {
      const lowStockMovements: StockMovement[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440102',
          itemId: mockItem.id,
          type: 'inbound',
          quantity: 5,
          previousQuantity: 0,
          newQuantity: 5,
          fromLocationId: null,
          toLocationId: null,
          timestamp: '2024-01-01T10:00:00Z',
        },
      ];
      
      const enriched = enrichItemsWithQuantities([mockItem], lowStockMovements);
      expect(enriched[0].isLowStock).toBe(true);
    });
  });

  describe('calculateTotalInventoryValue', () => {
    test('should sum all item values', () => {
      const enrichedItems = enrichItemsWithQuantities([mockItem], mockMovements);
      const total = calculateTotalInventoryValue(enrichedItems);
      expect(total).toBe(1750.00);
    });

    test('should return 0 for empty array', () => {
      const total = calculateTotalInventoryValue([]);
      expect(total).toBe(0);
    });
  });

  describe('calculateInventoryHealth', () => {
    test('should return health metrics with valid ranges', () => {
      const enrichedItems = enrichItemsWithQuantities([mockItem], mockMovements);
      
      const health = calculateInventoryHealth(enrichedItems, mockMovements);
      
      expect(health.totalItems).toBe(1);
      expect(health.totalValue).toBe(1750.00);
      expect(health.lowStockCount).toBeGreaterThanOrEqual(0);
      expect(health.overallHealthScore).toBeGreaterThanOrEqual(0);
      expect(health.overallHealthScore).toBeLessThanOrEqual(100);
      expect(health.turnoverRate).toBeGreaterThanOrEqual(0);
      expect(health.stockAgingDays).toBeGreaterThanOrEqual(0);
      expect(health.deadStockRatio).toBeGreaterThanOrEqual(0);
      expect(health.deadStockRatio).toBeLessThanOrEqual(1);
      expect(health.demandConsistency).toBeGreaterThanOrEqual(0);
      expect(health.demandConsistency).toBeLessThanOrEqual(1);
      expect(health.replenishmentEfficiency).toBeGreaterThanOrEqual(0);
      expect(health.replenishmentEfficiency).toBeLessThanOrEqual(1);
    });

    test('should handle empty inventory', () => {
      const health = calculateInventoryHealth([], []);
      
      expect(health.totalItems).toBe(0);
      expect(health.totalValue).toBe(0);
      expect(health.overallHealthScore).toBeGreaterThanOrEqual(0);
    });
  });
});
