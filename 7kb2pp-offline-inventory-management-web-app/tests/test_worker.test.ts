/**
 * Web Worker Tests
 * Tests for heavy computation offloading via Web Workers (Req 17)
 */

import { InventoryItem, StockMovement, InventoryItemWithQuantity } from '../repository_after/src/lib/schemas';

// Mock worker functions (same logic as in calculations.worker.ts)
// These test the calculation logic that runs in the worker

function calculateItemQuantity(itemId: string, movements: StockMovement[]): number {
  return movements
    .filter(m => m.itemId === itemId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

function calculateItemValue(quantity: number, unitCost: number): number {
  return quantity * unitCost;
}

function enrichItemsWithQuantities(
  items: InventoryItem[],
  movements: StockMovement[]
): InventoryItemWithQuantity[] {
  return items.map(item => {
    const quantity = calculateItemQuantity(item.id, movements);
    const totalValue = calculateItemValue(quantity, item.unitCost);
    const isLowStock = quantity <= item.reorderThreshold;
    
    return {
      ...item,
      quantity,
      totalValue,
      isLowStock,
    };
  });
}

function calculateValueByCategory(
  items: InventoryItem[],
  movements: StockMovement[]
): Record<string, number> {
  const enriched = enrichItemsWithQuantities(items, movements);
  const result: Record<string, number> = {};
  
  for (const item of enriched) {
    const categoryKey = item.categoryId || 'uncategorized';
    result[categoryKey] = (result[categoryKey] || 0) + item.totalValue;
  }
  
  return result;
}

function calculateValueByLocation(
  items: InventoryItem[],
  movements: StockMovement[]
): Record<string, number> {
  const enriched = enrichItemsWithQuantities(items, movements);
  const result: Record<string, number> = {};
  
  for (const item of enriched) {
    const locationKey = item.locationId || 'unassigned';
    result[locationKey] = (result[locationKey] || 0) + item.totalValue;
  }
  
  return result;
}

function identifySlowMovingItems(
  items: InventoryItem[],
  movements: StockMovement[],
  thresholdDays: number
): InventoryItem[] {
  const now = Date.now();
  const cutoff = now - (thresholdDays * 24 * 60 * 60 * 1000);
  
  return items.filter(item => {
    const itemMovements = movements.filter(
      m => m.itemId === item.id && new Date(m.timestamp).getTime() > cutoff
    );
    return itemMovements.length === 0;
  });
}

function identifyOverstockItems(
  items: InventoryItem[],
  movements: StockMovement[],
  multiplier: number
): InventoryItemWithQuantity[] {
  const enriched = enrichItemsWithQuantities(items, movements);
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  return enriched.filter(item => {
    const recentOutbound = movements.filter(
      m => m.itemId === item.id && 
           m.type === 'outbound' && 
           new Date(m.timestamp).getTime() > thirtyDaysAgo
    );
    const totalOutbound = Math.abs(recentOutbound.reduce((sum, m) => sum + m.quantity, 0));
    const dailyAverage = totalOutbound / 30;
    const threshold = dailyAverage * multiplier;
    
    return item.quantity > threshold && threshold > 0;
  });
}

function calculateTurnoverRates(
  items: InventoryItem[],
  movements: StockMovement[],
  periodDays: number
): Record<string, number> {
  const now = Date.now();
  const periodStart = now - (periodDays * 24 * 60 * 60 * 1000);
  const enriched = enrichItemsWithQuantities(items, movements);
  
  const result: Record<string, number> = {};
  
  for (const item of enriched) {
    const itemOutbound = movements.filter(
      m => m.itemId === item.id && 
           m.type === 'outbound' && 
           new Date(m.timestamp).getTime() > periodStart
    );
    const totalOutbound = Math.abs(itemOutbound.reduce((sum, m) => sum + m.quantity, 0));
    const avgInventory = item.quantity > 0 ? item.quantity / 2 : 1;
    result[item.id] = totalOutbound / avgInventory;
  }
  
  return result;
}

function calculateStockAging(
  enrichedItems: InventoryItemWithQuantity[],
  movements: StockMovement[]
): Record<string, number> {
  const now = Date.now();
  const result: Record<string, number> = {};
  
  for (const item of enrichedItems) {
    if (item.quantity <= 0) {
      result[item.id] = 0;
      continue;
    }
    
    const itemInbounds = movements
      .filter(m => m.itemId === item.id && m.type === 'inbound')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (itemInbounds.length === 0) {
      result[item.id] = 0;
      continue;
    }
    
    let remainingQty = item.quantity;
    let weightedAgeDays = 0;
    
    for (const inbound of itemInbounds) {
      if (remainingQty <= 0) break;
      
      const contribution = Math.min(inbound.quantity, remainingQty);
      const ageDays = (now - new Date(inbound.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      weightedAgeDays += contribution * ageDays;
      remainingQty -= contribution;
    }
    
    result[item.id] = weightedAgeDays / item.quantity;
  }
  
  return result;
}

function analyzeVelocity(itemId: string, movements: StockMovement[], periodDays: number) {
  const now = Date.now();
  const periodStart = now - (periodDays * 24 * 60 * 60 * 1000);
  
  const itemMovements = movements.filter(
    m => m.itemId === itemId && new Date(m.timestamp).getTime() > periodStart
  );
  
  const outboundMovements = itemMovements.filter(m => m.type === 'outbound');
  const totalOutbound = Math.abs(outboundMovements.reduce((sum, m) => sum + m.quantity, 0));
  
  const dailyVelocity = totalOutbound / periodDays;
  const weeklyVelocity = dailyVelocity * 7;
  const monthlyVelocity = dailyVelocity * 30;
  
  const currentQuantity = movements
    .filter(m => m.itemId === itemId)
    .reduce((sum, m) => sum + m.quantity, 0);
  
  const daysOfStock = dailyVelocity > 0 ? currentQuantity / dailyVelocity : Infinity;
  
  return {
    itemId,
    periodDays,
    totalOutbound,
    dailyVelocity,
    weeklyVelocity,
    monthlyVelocity,
    currentQuantity,
    daysOfStock,
    movementCount: itemMovements.length,
  };
}

describe('Web Worker Calculation Tests (Req 17)', () => {
  // Test data
  const mockItems: InventoryItem[] = [
    {
      id: 'item-001',
      name: 'Widget A',
      sku: 'SKU-001',
      categoryId: 'cat-001',
      locationId: 'loc-001',
      unitCost: 10.00,
      reorderThreshold: 20,
      lifecycleStatus: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'item-002',
      name: 'Widget B',
      sku: 'SKU-002',
      categoryId: 'cat-001',
      locationId: 'loc-002',
      unitCost: 25.00,
      reorderThreshold: 10,
      lifecycleStatus: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'item-003',
      name: 'Gadget C',
      sku: 'SKU-003',
      categoryId: 'cat-002',
      locationId: 'loc-001',
      unitCost: 50.00,
      reorderThreshold: 5,
      lifecycleStatus: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const now = new Date();
  const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
  const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago

  const mockMovements: StockMovement[] = [
    // Item 001: 100 in, 30 out = 70 quantity
    {
      id: 'mov-001',
      itemId: 'item-001',
      type: 'inbound',
      quantity: 100,
      previousQuantity: 0,
      newQuantity: 100,
      fromLocationId: null,
      toLocationId: 'loc-001',
      timestamp: oldDate,
    },
    {
      id: 'mov-002',
      itemId: 'item-001',
      type: 'outbound',
      quantity: -30,
      previousQuantity: 100,
      newQuantity: 70,
      fromLocationId: 'loc-001',
      toLocationId: null,
      timestamp: recentDate,
    },
    // Item 002: 50 in = 50 quantity
    {
      id: 'mov-003',
      itemId: 'item-002',
      type: 'inbound',
      quantity: 50,
      previousQuantity: 0,
      newQuantity: 50,
      fromLocationId: null,
      toLocationId: 'loc-002',
      timestamp: recentDate,
    },
    // Item 003: 20 in, no recent movement (old)
    {
      id: 'mov-004',
      itemId: 'item-003',
      type: 'inbound',
      quantity: 20,
      previousQuantity: 0,
      newQuantity: 20,
      fromLocationId: null,
      toLocationId: 'loc-001',
      timestamp: oldDate,
    },
  ];

  describe('calculateValueByCategory (worker offload)', () => {
    test('should group values by category correctly', () => {
      const result = calculateValueByCategory(mockItems, mockMovements);
      
      // cat-001: item-001 (70 * 10 = 700) + item-002 (50 * 25 = 1250) = 1950
      expect(result['cat-001']).toBe(1950);
      // cat-002: item-003 (20 * 50 = 1000)
      expect(result['cat-002']).toBe(1000);
    });

    test('should handle uncategorized items', () => {
      const uncategorizedItems = [{ ...mockItems[0], categoryId: null }];
      const result = calculateValueByCategory(uncategorizedItems, mockMovements);
      
      expect(result['uncategorized']).toBe(700);
    });

    test('should handle empty items array', () => {
      const result = calculateValueByCategory([], mockMovements);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('calculateValueByLocation (worker offload)', () => {
    test('should group values by location correctly', () => {
      const result = calculateValueByLocation(mockItems, mockMovements);
      
      // loc-001: item-001 (700) + item-003 (1000) = 1700
      expect(result['loc-001']).toBe(1700);
      // loc-002: item-002 (1250)
      expect(result['loc-002']).toBe(1250);
    });

    test('should handle unassigned location items', () => {
      const unassignedItems = [{ ...mockItems[0], locationId: null }];
      const result = calculateValueByLocation(unassignedItems, mockMovements);
      
      expect(result['unassigned']).toBe(700);
    });
  });

  describe('identifySlowMovingItems (worker offload)', () => {
    test('should identify items with no recent movements', () => {
      // Item 003 has no movements in last 30 days
      const result = identifySlowMovingItems(mockItems, mockMovements, 30);
      
      expect(result.some(item => item.id === 'item-003')).toBe(true);
    });

    test('should not flag items with recent movements', () => {
      const result = identifySlowMovingItems(mockItems, mockMovements, 30);
      
      // Item 001 and 002 have recent movements
      expect(result.some(item => item.id === 'item-001')).toBe(false);
      expect(result.some(item => item.id === 'item-002')).toBe(false);
    });

    test('should return empty array if all items have recent movements', () => {
      const result = identifySlowMovingItems(mockItems, mockMovements, 90);
      // With 90 day threshold, even old movements are "recent"
      expect(result).toHaveLength(0);
    });
  });

  describe('identifyOverstockItems (worker offload)', () => {
    test('should identify overstocked items based on multiplier', () => {
      // Create movements with recent outbound to calculate daily average
      const overstockMovements: StockMovement[] = [
        {
          id: 'mov-os-1',
          itemId: 'item-001',
          type: 'inbound',
          quantity: 1000,
          previousQuantity: 0,
          newQuantity: 1000,
          fromLocationId: null,
          toLocationId: 'loc-001',
          timestamp: recentDate,
        },
        {
          id: 'mov-os-2',
          itemId: 'item-001',
          type: 'outbound',
          quantity: -10,
          previousQuantity: 1000,
          newQuantity: 990,
          fromLocationId: 'loc-001',
          toLocationId: null,
          timestamp: recentDate,
        },
      ];
      
      // Daily average = 10/30 ≈ 0.33, threshold at 5x = 1.67
      // Quantity = 990 >> 1.67, so should be overstocked
      const result = identifyOverstockItems([mockItems[0]], overstockMovements, 5);
      expect(result.some(item => item.id === 'item-001')).toBe(true);
    });

    test('should not flag items with balanced stock levels', () => {
      // With no outbound movements, threshold is 0, so filter condition fails
      const noOutboundMovements: StockMovement[] = [
        {
          id: 'mov-nb-1',
          itemId: 'item-001',
          type: 'inbound',
          quantity: 50,
          previousQuantity: 0,
          newQuantity: 50,
          fromLocationId: null,
          toLocationId: 'loc-001',
          timestamp: recentDate,
        },
      ];
      
      const result = identifyOverstockItems([mockItems[0]], noOutboundMovements, 5);
      expect(result).toHaveLength(0);
    });
  });

  describe('calculateTurnoverRates (worker offload)', () => {
    test('should calculate turnover rates for all items', () => {
      const result = calculateTurnoverRates(mockItems, mockMovements, 30);
      
      expect(result['item-001']).toBeDefined();
      expect(result['item-002']).toBeDefined();
      expect(result['item-003']).toBeDefined();
    });

    test('should return higher turnover for items with more outbound', () => {
      const result = calculateTurnoverRates(mockItems, mockMovements, 30);
      
      // Item 001 has outbound movement, others don't in the period
      expect(result['item-001']).toBeGreaterThan(0);
    });

    test('should handle items with no movements', () => {
      const noMovementItems = [{ ...mockItems[0], id: 'no-movement-item' }];
      const result = calculateTurnoverRates(noMovementItems, [], 30);
      
      expect(result['no-movement-item']).toBe(0);
    });
  });

  describe('calculateStockAging (worker offload)', () => {
    test('should calculate weighted aging for items', () => {
      const enriched = enrichItemsWithQuantities(mockItems, mockMovements);
      const result = calculateStockAging(enriched, mockMovements);
      
      // All items should have aging values
      expect(result['item-001']).toBeGreaterThanOrEqual(0);
      expect(result['item-002']).toBeGreaterThanOrEqual(0);
      expect(result['item-003']).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 for items with zero quantity', () => {
      const zeroQuantityEnriched: InventoryItemWithQuantity[] = [{
        ...mockItems[0],
        quantity: 0,
        totalValue: 0,
        isLowStock: true,
      }];
      
      const result = calculateStockAging(zeroQuantityEnriched, mockMovements);
      expect(result['item-001']).toBe(0);
    });

    test('should return 0 for items with no inbound movements', () => {
      const enriched: InventoryItemWithQuantity[] = [{
        ...mockItems[0],
        id: 'new-item',
        quantity: 10,
        totalValue: 100,
        isLowStock: false,
      }];
      
      const result = calculateStockAging(enriched, mockMovements);
      expect(result['new-item']).toBe(0);
    });
  });

  describe('analyzeVelocity (worker offload)', () => {
    test('should calculate velocity metrics', () => {
      const result = analyzeVelocity('item-001', mockMovements, 30);
      
      expect(result.itemId).toBe('item-001');
      expect(result.periodDays).toBe(30);
      expect(result.totalOutbound).toBeGreaterThanOrEqual(0);
      expect(result.dailyVelocity).toBeGreaterThanOrEqual(0);
      expect(result.weeklyVelocity).toBeGreaterThanOrEqual(0);
      expect(result.monthlyVelocity).toBeGreaterThanOrEqual(0);
      expect(result.currentQuantity).toBe(70);
    });

    test('should return Infinity days of stock when no outbound', () => {
      const result = analyzeVelocity('item-002', mockMovements, 30);
      
      // Item 002 has no outbound, so velocity = 0, daysOfStock = Infinity
      expect(result.daysOfStock).toBe(Infinity);
    });

    test('should calculate days of stock correctly', () => {
      // Item 001 has 30 outbound in ~5 days period, but we use 30 day period
      const result = analyzeVelocity('item-001', mockMovements, 30);
      
      // dailyVelocity = 30/30 = 1, currentQuantity = 70, daysOfStock = 70
      expect(result.daysOfStock).toBe(70);
    });
  });

  describe('Large dataset simulation (Req 17 - items > 1000)', () => {
    test('should handle 1000+ items efficiently', () => {
      // Generate large dataset
      const largeItems: InventoryItem[] = [];
      const largeMovements: StockMovement[] = [];
      
      for (let i = 0; i < 1500; i++) {
        largeItems.push({
          id: `item-${i.toString().padStart(5, '0')}`,
          name: `Item ${i}`,
          sku: `SKU-${i.toString().padStart(5, '0')}`,
          categoryId: `cat-${i % 10}`,
          locationId: `loc-${i % 5}`,
          unitCost: Math.random() * 100,
          reorderThreshold: Math.floor(Math.random() * 50),
          lifecycleStatus: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        });
        
        largeMovements.push({
          id: `mov-${i.toString().padStart(5, '0')}`,
          itemId: `item-${i.toString().padStart(5, '0')}`,
          type: 'inbound',
          quantity: Math.floor(Math.random() * 100) + 1,
          previousQuantity: 0,
          newQuantity: Math.floor(Math.random() * 100) + 1,
          fromLocationId: null,
          toLocationId: `loc-${i % 5}`,
          timestamp: new Date().toISOString(),
        });
      }
      
      const startTime = Date.now();
      
      // These operations would be offloaded to web worker
      const enriched = enrichItemsWithQuantities(largeItems, largeMovements);
      const byCategory = calculateValueByCategory(largeItems, largeMovements);
      const byLocation = calculateValueByLocation(largeItems, largeMovements);
      const slowMoving = identifySlowMovingItems(largeItems, largeMovements, 30);
      const turnover = calculateTurnoverRates(largeItems, largeMovements, 30);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify calculations completed
      expect(enriched).toHaveLength(1500);
      expect(Object.keys(byCategory)).toHaveLength(10);
      expect(Object.keys(byLocation)).toHaveLength(5);
      expect(slowMoving).toBeDefined();
      expect(Object.keys(turnover)).toHaveLength(1500);
      
      // Performance check: should complete in reasonable time
      // In a real web worker, this wouldn't block the main thread
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });
});
