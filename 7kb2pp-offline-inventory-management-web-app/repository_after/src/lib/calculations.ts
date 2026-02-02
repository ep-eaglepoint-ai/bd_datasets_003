import { 
  InventoryItem, 
  StockMovement, 
  InventoryItemWithQuantity,
  InventoryHealth,
  Category,
  Location,
} from './schemas';

/**
 * Calculate current quantity for an item from movement history.
 * This ensures deterministic calculation - quantity is always derived from movements.
 * 
 * Formula: Sum of all movement quantities for the item
 * - Inbound: positive quantity
 * - Outbound: negative quantity
 * - Adjustments: can be positive or negative
 */
export function calculateItemQuantity(itemId: string, movements: StockMovement[]): number {
  const itemMovements = movements.filter(m => m.itemId === itemId);
  
  if (itemMovements.length === 0) return 0;
  
  // Get the latest movement's newQuantity (most accurate)
  const sortedMovements = [...itemMovements].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  return sortedMovements[0].newQuantity;
}

/**
 * Calculate total value for an item.
 * Formula: quantity * unitCost
 * Uses precise decimal handling to avoid floating-point errors.
 */
export function calculateItemValue(quantity: number, unitCost: number): number {
  // Round to 2 decimal places to avoid floating-point precision issues
  return Math.round(quantity * unitCost * 100) / 100;
}

/**
 * Enrich inventory items with computed quantities and values.
 * All computations are deterministic and derived from movement history.
 */
export function enrichItemsWithQuantities(
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

/**
 * Calculate total inventory value.
 * Formula: Sum of (quantity * unitCost) for all items
 * Accepts either enriched items or raw items with movements
 */
export function calculateTotalInventoryValue(
  itemsOrEnriched: InventoryItem[] | InventoryItemWithQuantity[],
  movements?: StockMovement[]
): number {
  // Check if already enriched (has totalValue property)
  if (itemsOrEnriched.length > 0 && 'totalValue' in itemsOrEnriched[0]) {
    const enrichedItems = itemsOrEnriched as InventoryItemWithQuantity[];
    const total = enrichedItems.reduce((sum, item) => sum + item.totalValue, 0);
    return Math.round(total * 100) / 100;
  }
  
  // Need to enrich first
  if (!movements) {
    return 0;
  }
  const enrichedItems = enrichItemsWithQuantities(itemsOrEnriched as InventoryItem[], movements);
  const total = enrichedItems.reduce((sum, item) => sum + item.totalValue, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Calculate value breakdown by category.
 * Returns a map of categoryId -> total value
 */
export function calculateValueByCategory(
  items: InventoryItem[],
  movements: StockMovement[]
): Record<string, number> {
  const enrichedItems = enrichItemsWithQuantities(items, movements);
  const breakdown: Record<string, number> = {};
  
  for (const item of enrichedItems) {
    const categoryId = item.categoryId || 'uncategorized';
    breakdown[categoryId] = (breakdown[categoryId] || 0) + item.totalValue;
  }
  
  // Round all values
  for (const key in breakdown) {
    breakdown[key] = Math.round(breakdown[key] * 100) / 100;
  }
  
  return breakdown;
}

/**
 * Calculate value breakdown by location.
 * Returns a map of locationId -> total value
 */
export function calculateValueByLocation(
  items: InventoryItem[],
  movements: StockMovement[]
): Record<string, number> {
  const enrichedItems = enrichItemsWithQuantities(items, movements);
  const breakdown: Record<string, number> = {};
  
  for (const item of enrichedItems) {
    const locationId = item.locationId || 'unassigned';
    breakdown[locationId] = (breakdown[locationId] || 0) + item.totalValue;
  }
  
  // Round all values
  for (const key in breakdown) {
    breakdown[key] = Math.round(breakdown[key] * 100) / 100;
  }
  
  return breakdown;
}

/**
 * Calculate stock turnover rate.
 * Formula: (Total Outbound Quantity / Average Inventory) over a period
 * 
 * Explanation:
 * - Higher turnover = items selling faster
 * - Lower turnover = items staying in inventory longer
 */
export function calculateTurnoverRate(
  itemId: string,
  movements: StockMovement[],
  periodDays: number = 30
): number {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  const itemMovements = movements.filter(
    m => m.itemId === itemId && new Date(m.timestamp) >= periodStart
  );
  
  if (itemMovements.length === 0) return 0;
  
  // Calculate total outbound quantity
  const totalOutbound = itemMovements
    .filter(m => m.type === 'outbound' || (m.type === 'adjustment' && m.quantity < 0))
    .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  
  // Calculate average inventory
  const quantities = itemMovements.map(m => m.newQuantity);
  const avgInventory = quantities.reduce((sum, q) => sum + q, 0) / quantities.length;
  
  if (avgInventory === 0) return totalOutbound > 0 ? Infinity : 0;
  
  return Math.round((totalOutbound / avgInventory) * 100) / 100;
}

/**
 * Calculate stock aging in days.
 * Formula: Days since oldest inbound movement with remaining quantity
 * 
 * Uses FIFO assumption - oldest stock is assumed to be sold first.
 */
export function calculateStockAgingDays(
  itemId: string,
  movements: StockMovement[],
  currentQuantity: number
): number {
  if (currentQuantity === 0) return 0;
  
  const itemMovements = movements
    .filter(m => m.itemId === itemId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Find the oldest inbound that hasn't been fully consumed
  let remainingToAccount = currentQuantity;
  let oldestRelevantDate: Date | null = null;
  
  for (const movement of itemMovements) {
    if (movement.type === 'inbound' && remainingToAccount > 0) {
      if (!oldestRelevantDate) {
        oldestRelevantDate = new Date(movement.timestamp);
      }
      remainingToAccount -= movement.quantity;
    }
  }
  
  if (!oldestRelevantDate) return 0;
  
  const now = new Date();
  const diffMs = now.getTime() - oldestRelevantDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Identify slow-moving items.
 * An item is slow-moving if its turnover rate is below threshold.
 */
export function identifySlowMovingItems(
  items: InventoryItem[],
  movements: StockMovement[],
  turnoverThreshold: number = 0.5,
  periodDays: number = 30
): InventoryItemWithQuantity[] {
  const enrichedItems = enrichItemsWithQuantities(items, movements);
  
  return enrichedItems.filter(item => {
    if (item.quantity === 0) return false;
    const turnover = calculateTurnoverRate(item.id, movements, periodDays);
    return turnover < turnoverThreshold;
  });
}

/**
 * Identify overstock items.
 * An item is overstocked if quantity exceeds a multiple of the reorder threshold.
 */
export function identifyOverstockItems(
  items: InventoryItem[],
  movements: StockMovement[],
  multiplier: number = 5
): InventoryItemWithQuantity[] {
  const enrichedItems = enrichItemsWithQuantities(items, movements);
  
  return enrichedItems.filter(item => {
    if (item.reorderThreshold === 0) return false;
    return item.quantity > item.reorderThreshold * multiplier;
  });
}

/**
 * Calculate demand consistency score.
 * Formula: 1 - (Standard Deviation / Mean) of outbound movements
 * 
 * Higher score = more consistent demand
 * Lower score = erratic demand patterns
 */
export function calculateDemandConsistency(
  itemId: string,
  movements: StockMovement[],
  periodDays: number = 90
): number {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  const outboundMovements = movements.filter(
    m => m.itemId === itemId && 
         m.type === 'outbound' && 
         new Date(m.timestamp) >= periodStart
  );
  
  if (outboundMovements.length < 2) return 1; // Not enough data, assume consistent
  
  const quantities = outboundMovements.map(m => Math.abs(m.quantity));
  const mean = quantities.reduce((sum, q) => sum + q, 0) / quantities.length;
  
  if (mean === 0) return 1;
  
  const variance = quantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / quantities.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;
  
  // Convert to 0-1 scale where 1 is most consistent
  return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
}

/**
 * Calculate dead stock ratio.
 * Formula: (Items with zero movements in period) / (Total items)
 * 
 * Explanation:
 * - Dead stock = items that haven't moved
 * - Higher ratio = more capital tied up in non-moving inventory
 */
export function calculateDeadStockRatio(
  items: InventoryItem[],
  movements: StockMovement[],
  periodDays: number = 90
): number {
  if (items.length === 0) return 0;
  
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  const itemsWithRecentMovements = new Set(
    movements
      .filter(m => new Date(m.timestamp) >= periodStart)
      .map(m => m.itemId)
  );
  
  const enrichedItems = enrichItemsWithQuantities(items, movements);
  const deadStockCount = enrichedItems.filter(
    item => item.quantity > 0 && !itemsWithRecentMovements.has(item.id)
  ).length;
  
  const itemsWithStock = enrichedItems.filter(item => item.quantity > 0).length;
  if (itemsWithStock === 0) return 0;
  
  return Math.round((deadStockCount / itemsWithStock) * 100) / 100;
}

/**
 * Calculate replenishment efficiency.
 * Formula: (Successful replenishments) / (Total low-stock occurrences)
 * 
 * Measures how well the system recovers from low-stock situations.
 */
export function calculateReplenishmentEfficiency(
  itemId: string,
  movements: StockMovement[],
  reorderThreshold: number
): number {
  const itemMovements = [...movements]
    .filter(m => m.itemId === itemId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  let lowStockOccurrences = 0;
  let successfulReplenishments = 0;
  let wasLowStock = false;
  
  for (const movement of itemMovements) {
    const isLowStock = movement.newQuantity <= reorderThreshold;
    
    if (isLowStock && !wasLowStock) {
      lowStockOccurrences++;
    } else if (!isLowStock && wasLowStock) {
      successfulReplenishments++;
    }
    
    wasLowStock = isLowStock;
  }
  
  if (lowStockOccurrences === 0) return 1;
  
  return Math.round((successfulReplenishments / lowStockOccurrences) * 100) / 100;
}

/**
 * Calculate overall inventory health score.
 * Combines multiple metrics into a single 0-100 score.
 * 
 * Components:
 * - Dead stock ratio (inverse) - 25%
 * - Replenishment efficiency - 25%
 * - Demand consistency - 25%
 * - Turnover health - 25%
 * 
 * Accepts either enriched items or raw items with movements
 */
export function calculateInventoryHealth(
  itemsOrEnriched: InventoryItem[] | InventoryItemWithQuantity[],
  movements: StockMovement[]
): InventoryHealth {
  // Check if already enriched
  let items: InventoryItem[];
  let enrichedItems: InventoryItemWithQuantity[];
  
  if (itemsOrEnriched.length > 0 && 'totalValue' in itemsOrEnriched[0]) {
    enrichedItems = itemsOrEnriched as InventoryItemWithQuantity[];
    items = enrichedItems.map(({ quantity, totalValue, isLowStock, ...item }) => item);
  } else {
    items = itemsOrEnriched as InventoryItem[];
    enrichedItems = enrichItemsWithQuantities(items, movements);
  }
  // Calculate totals
  const totalItems = enrichedItems.length;
  const totalValue = enrichedItems.reduce((sum, item) => sum + item.totalValue, 0);
  const lowStockCount = enrichedItems.filter(item => item.isLowStock).length;
  
  const deadStockRatio = calculateDeadStockRatio(items, movements);
  
  // Calculate average replenishment efficiency
  const replenishmentEfficiencies = items.map(item => 
    calculateReplenishmentEfficiency(item.id, movements, item.reorderThreshold)
  );
  const avgReplenishmentEfficiency = replenishmentEfficiencies.length > 0
    ? replenishmentEfficiencies.reduce((sum, e) => sum + e, 0) / replenishmentEfficiencies.length
    : 1;
  
  // Calculate average demand consistency
  const demandConsistencies = items.map(item => 
    calculateDemandConsistency(item.id, movements)
  );
  const avgDemandConsistency = demandConsistencies.length > 0
    ? demandConsistencies.reduce((sum, c) => sum + c, 0) / demandConsistencies.length
    : 1;
  
  // Calculate average stock aging
  const agingDays = enrichedItems.map(item => 
    calculateStockAgingDays(item.id, movements, item.quantity)
  );
  const avgAgingDays = agingDays.length > 0
    ? agingDays.reduce((sum, d) => sum + d, 0) / agingDays.length
    : 0;
  
  // Calculate average turnover rate
  const turnoverRates = items.map(item => 
    calculateTurnoverRate(item.id, movements)
  );
  const avgTurnoverRate = turnoverRates.length > 0
    ? turnoverRates.reduce((sum, t) => sum + t, 0) / turnoverRates.length
    : 0;
  
  // Normalize turnover rate to 0-1 scale (assuming 2.0 is optimal)
  const turnoverHealth = Math.min(1, avgTurnoverRate / 2);
  
  // Calculate overall health score (0-100)
  const overallHealthScore = Math.round(
    ((1 - deadStockRatio) * 25 +
     avgReplenishmentEfficiency * 25 +
     avgDemandConsistency * 25 +
     turnoverHealth * 25)
  );
  
  return {
    totalItems,
    totalValue: Math.round(totalValue * 100) / 100,
    lowStockCount,
    deadStockRatio: Math.round(deadStockRatio * 100) / 100,
    replenishmentEfficiency: Math.round(avgReplenishmentEfficiency * 100) / 100,
    stockAgingDays: Math.round(avgAgingDays),
    demandConsistency: Math.round(avgDemandConsistency * 100) / 100,
    turnoverRate: Math.round(avgTurnoverRate * 100) / 100,
    overallHealthScore: Math.max(0, Math.min(100, overallHealthScore)),
  };
}

/**
 * Generate stock history data for charts.
 * Returns daily aggregated data for a given period.
 */
export function generateStockHistoryData(
  itemId: string,
  movements: StockMovement[],
  periodDays: number = 30
): Array<{ date: string; quantity: number }> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  const itemMovements = movements
    .filter(m => m.itemId === itemId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const result: Array<{ date: string; quantity: number }> = [];
  
  // Get initial quantity before period
  const movementsBeforePeriod = itemMovements.filter(
    m => new Date(m.timestamp) < periodStart
  );
  let currentQuantity = movementsBeforePeriod.length > 0
    ? movementsBeforePeriod[movementsBeforePeriod.length - 1].newQuantity
    : 0;
  
  // Generate daily data points
  for (let d = 0; d < periodDays; d++) {
    const date = new Date(periodStart.getTime() + d * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    // Apply movements for this day
    const dayMovements = itemMovements.filter(m => {
      const movDate = new Date(m.timestamp).toISOString().split('T')[0];
      return movDate === dateStr;
    });
    
    if (dayMovements.length > 0) {
      currentQuantity = dayMovements[dayMovements.length - 1].newQuantity;
    }
    
    result.push({ date: dateStr, quantity: currentQuantity });
  }
  
  return result;
}

/**
 * Generate valuation history data for charts.
 */
export function generateValuationHistoryData(
  items: InventoryItem[],
  movements: StockMovement[],
  periodDays: number = 30
): Array<{ date: string; totalValue: number }> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  const result: Array<{ date: string; totalValue: number }> = [];
  
  for (let d = 0; d < periodDays; d++) {
    const date = new Date(periodStart.getTime() + d * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    // Calculate total value as of this date
    let totalValue = 0;
    for (const item of items) {
      const itemMovements = movements
        .filter(m => m.itemId === item.id && new Date(m.timestamp).toISOString().split('T')[0] <= dateStr)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const quantity = itemMovements.length > 0 ? itemMovements[0].newQuantity : 0;
      totalValue += calculateItemValue(quantity, item.unitCost);
    }
    
    result.push({ date: dateStr, totalValue: Math.round(totalValue * 100) / 100 });
  }
  
  return result;
}
