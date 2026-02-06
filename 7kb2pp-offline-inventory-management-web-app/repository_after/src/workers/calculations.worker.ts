// Web Worker for heavy inventory calculations
// This offloads CPU-intensive work from the main thread

import { InventoryItem, StockMovement, InventoryItemWithQuantity } from '../lib/schemas';

export interface WorkerMessage {
  type: 'calculateQuantities' | 'calculateHealth' | 'calculateTrends' | 'analyzeVelocity' | 
        'calculateValueByCategory' | 'calculateValueByLocation' | 'identifySlowMovingItems' | 
        'identifyOverstockItems' | 'calculateTurnoverRates' | 'calculateStockAging';
  payload: unknown;
}

export interface QuantitiesPayload {
  items: InventoryItem[];
  movements: StockMovement[];
}

export interface HealthPayload {
  enrichedItems: InventoryItemWithQuantity[];
  movements: StockMovement[];
}

export interface TrendsPayload {
  movements: StockMovement[];
  days: number;
}

export interface VelocityPayload {
  itemId: string;
  movements: StockMovement[];
  periodDays: number;
}

export interface ValueByCategoryPayload {
  items: InventoryItem[];
  movements: StockMovement[];
}

export interface ValueByLocationPayload {
  items: InventoryItem[];
  movements: StockMovement[];
}

export interface SlowMovingPayload {
  items: InventoryItem[];
  movements: StockMovement[];
  thresholdDays: number;
}

export interface OverstockPayload {
  items: InventoryItem[];
  movements: StockMovement[];
  multiplier: number;
}

export interface TurnoverRatesPayload {
  items: InventoryItem[];
  movements: StockMovement[];
  periodDays: number;
}

export interface StockAgingPayload {
  enrichedItems: InventoryItemWithQuantity[];
  movements: StockMovement[];
}

// Calculate item quantity from movements
function calculateItemQuantity(itemId: string, movements: StockMovement[]): number {
  return movements
    .filter(m => m.itemId === itemId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

// Calculate item value
function calculateItemValue(quantity: number, unitCost: number): number {
  return quantity * unitCost;
}

// Enrich items with quantities (CPU-intensive for large datasets)
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

// Calculate inventory health metrics
function calculateHealth(
  enrichedItems: InventoryItemWithQuantity[],
  movements: StockMovement[]
) {
  const totalItems = enrichedItems.length;
  const totalValue = enrichedItems.reduce((sum, item) => sum + item.totalValue, 0);
  const lowStockCount = enrichedItems.filter(item => item.isLowStock).length;
  
  // Calculate turnover rate
  const outboundMovements = movements.filter(m => m.type === 'outbound');
  const totalOutbound = Math.abs(outboundMovements.reduce((sum, m) => sum + m.quantity, 0));
  const avgInventory = totalValue > 0 ? totalValue / 2 : 1;
  const turnoverRate = totalOutbound / avgInventory;
  
  // Calculate stock aging
  const now = Date.now();
  const stockAgingDays = totalItems > 0
    ? enrichedItems.reduce((sum, item) => {
        const createdAt = new Date(item.createdAt).getTime();
        const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
        return sum + ageDays;
      }, 0) / totalItems
    : 0;
  
  // Calculate dead stock ratio (items with no movement in 90 days)
  const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
  const recentMovementItemIds = new Set(
    movements
      .filter(m => new Date(m.timestamp).getTime() > ninetyDaysAgo)
      .map(m => m.itemId)
  );
  const deadStockCount = enrichedItems.filter(
    item => !recentMovementItemIds.has(item.id) && item.quantity > 0
  ).length;
  const deadStockRatio = totalItems > 0 ? deadStockCount / totalItems : 0;
  
  // Calculate demand consistency (coefficient of variation of outbound movements)
  const outboundQuantities = outboundMovements.map(m => Math.abs(m.quantity));
  let demandConsistency = 1;
  if (outboundQuantities.length > 1) {
    const mean = outboundQuantities.reduce((a, b) => a + b, 0) / outboundQuantities.length;
    const variance = outboundQuantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / outboundQuantities.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    demandConsistency = Math.max(0, 1 - cv);
  }
  
  // Calculate replenishment efficiency
  const inboundMovements = movements.filter(m => m.type === 'inbound');
  const lowStockItems = enrichedItems.filter(item => item.isLowStock);
  const replenishedCount = lowStockItems.filter(item => 
    inboundMovements.some(m => m.itemId === item.id)
  ).length;
  const replenishmentEfficiency = lowStockItems.length > 0 
    ? replenishedCount / lowStockItems.length 
    : 1;
  
  // Overall health score (weighted average)
  const overallHealthScore = Math.min(100, Math.max(0,
    (1 - deadStockRatio) * 25 +
    demandConsistency * 25 +
    replenishmentEfficiency * 25 +
    Math.min(1, turnoverRate) * 25
  ));
  
  return {
    totalItems,
    totalValue,
    lowStockCount,
    deadStockRatio,
    demandConsistency,
    replenishmentEfficiency,
    turnoverRate,
    stockAgingDays,
    overallHealthScore,
  };
}

// Calculate movement trends over time
function calculateTrends(movements: StockMovement[], days: number) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  
  const recentMovements = movements.filter(
    m => new Date(m.timestamp).getTime() > startTime
  );
  
  // Group by day
  const dailyData: Record<string, { inbound: number; outbound: number; adjustments: number }> = {};
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now - (i * 24 * 60 * 60 * 1000));
    const dateKey = date.toISOString().split('T')[0];
    dailyData[dateKey] = { inbound: 0, outbound: 0, adjustments: 0 };
  }
  
  recentMovements.forEach(m => {
    const dateKey = m.timestamp.split('T')[0];
    if (dailyData[dateKey]) {
      if (m.type === 'inbound') {
        dailyData[dateKey].inbound += m.quantity;
      } else if (m.type === 'outbound') {
        dailyData[dateKey].outbound += Math.abs(m.quantity);
      } else {
        dailyData[dateKey].adjustments += m.quantity;
      }
    }
  });
  
  return Object.entries(dailyData)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Analyze stock velocity for a specific item
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
  
  // Calculate days of stock remaining
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

// Calculate value grouped by category (CPU-intensive for large datasets)
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

// Calculate value grouped by location (CPU-intensive for large datasets)
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

// Identify slow-moving items (no movements in thresholdDays)
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

// Identify overstocked items (quantity > multiplier * average daily outbound)
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

// Calculate turnover rates for all items (batch operation)
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

// Calculate stock aging for all items (batch operation)
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
    
    // Find the earliest inbound movement that contributes to current stock
    const itemInbounds = movements
      .filter(m => m.itemId === item.id && m.type === 'inbound')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (itemInbounds.length === 0) {
      result[item.id] = 0;
      continue;
    }
    
    // Weight aging by quantity contribution (FIFO approximation)
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

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    let result: unknown;
    
    switch (type) {
      case 'calculateQuantities': {
        const { items, movements } = payload as QuantitiesPayload;
        result = enrichItemsWithQuantities(items, movements);
        break;
      }
      case 'calculateHealth': {
        const { enrichedItems, movements } = payload as HealthPayload;
        result = calculateHealth(enrichedItems, movements);
        break;
      }
      case 'calculateTrends': {
        const { movements, days } = payload as TrendsPayload;
        result = calculateTrends(movements, days);
        break;
      }
      case 'analyzeVelocity': {
        const { itemId, movements, periodDays } = payload as VelocityPayload;
        result = analyzeVelocity(itemId, movements, periodDays);
        break;
      }
      case 'calculateValueByCategory': {
        const { items, movements } = payload as ValueByCategoryPayload;
        result = calculateValueByCategory(items, movements);
        break;
      }
      case 'calculateValueByLocation': {
        const { items, movements } = payload as ValueByLocationPayload;
        result = calculateValueByLocation(items, movements);
        break;
      }
      case 'identifySlowMovingItems': {
        const { items, movements, thresholdDays } = payload as SlowMovingPayload;
        result = identifySlowMovingItems(items, movements, thresholdDays);
        break;
      }
      case 'identifyOverstockItems': {
        const { items, movements, multiplier } = payload as OverstockPayload;
        result = identifyOverstockItems(items, movements, multiplier);
        break;
      }
      case 'calculateTurnoverRates': {
        const { items, movements, periodDays } = payload as TurnoverRatesPayload;
        result = calculateTurnoverRates(items, movements, periodDays);
        break;
      }
      case 'calculateStockAging': {
        const { enrichedItems, movements } = payload as StockAgingPayload;
        result = calculateStockAging(enrichedItems, movements);
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ success: false, error: (error as Error).message });
  }
};

export {};
