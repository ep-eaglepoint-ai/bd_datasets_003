import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  InventoryItem, 
  Category, 
  Location, 
  StockMovement, 
  AuditLog,
  ValuationSnapshot,
  InventoryItemWithQuantity,
  Filter,
  MovementType,
  LifecycleStatus,
  BulkEdit,
  ExportData,
} from './schemas';
import { db } from './db';
import { 
  enrichItemsWithQuantities,
  calculateTotalInventoryValue,
  calculateValueByCategory,
  calculateValueByLocation,
  calculateInventoryHealth,
} from './calculations';

// Debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Debounced persistence function (will be initialized after store is created)
let debouncedSaveRecoveryState: (() => void) | null = null;

interface InventoryState {
  // Data
  items: InventoryItem[];
  categories: Category[];
  locations: Location[];
  movements: StockMovement[];
  auditLogs: AuditLog[];
  valuationSnapshots: ValuationSnapshot[];
  
  // UI State
  isLoading: boolean;
  error: string | null;
  filter: Filter;
  
  // Computed (memoized via selectors)
  
  // Actions
  initialize: () => Promise<void>;
  
  // Item actions
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  
  // Category actions
  addCategory: (category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  // Location actions
  addLocation: (location: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Location>;
  updateLocation: (id: string, updates: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  // Movement actions
  recordMovement: (
    itemId: string,
    type: MovementType,
    quantity: number,
    reason?: string,
    fromLocationId?: string,
    toLocationId?: string
  ) => Promise<StockMovement>;
  
  // Explicit transfer action - updates item location AND creates immutable movement
  recordTransfer: (
    itemId: string,
    toLocationId: string | null,
    reason?: string
  ) => Promise<StockMovement>;
  
  // Explicit correction action - adjusts quantity with audit trail
  recordCorrection: (
    itemId: string,
    newQuantity: number,
    reason: string
  ) => Promise<StockMovement>;
  
  // Bulk operations
  bulkUpdateItems: (edit: BulkEdit) => Promise<void>;
  bulkImport: (data: ExportData) => Promise<void>;
  
  // Filter actions
  setFilter: (filter: Partial<Filter>) => void;
  clearFilter: () => void;
  
  // Export
  exportData: () => ExportData;
  exportCSV: () => string;
  exportValuationSummary: () => any;
  exportAnalyticsSnapshot: () => any;
  
  // Valuation snapshots
  addValuationSnapshot: () => Promise<ValuationSnapshot>;
  
  // Recovery
  saveRecoveryState: () => Promise<void>;
  loadRecoveryState: () => Promise<void>;
  needsRecovery: () => Promise<boolean>;
}

// Helper to create audit log
function createAuditLog(
  entityType: 'item' | 'category' | 'location' | 'movement',
  entityId: string,
  action: 'create' | 'update' | 'delete' | 'restore',
  changes: Record<string, unknown>
): AuditLog {
  return {
    id: uuidv4(),
    entityType,
    entityId,
    action,
    changes,
    timestamp: new Date().toISOString(),
  };
}


function calculateLocationTotal(locationId: string | null, items: InventoryItem[], movements: StockMovement[]): number {
  if (!locationId) return 0;
  
  const locationItems = items.filter(i => i.locationId === locationId);
  let total = 0;
  
  for (const item of locationItems) {
    const itemMovements = movements.filter(m => m.itemId === item.id);
    if (itemMovements.length > 0) {
      const lastMovement = itemMovements.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
      total += lastMovement.newQuantity;
    }
  }
  
  return total;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  // Initial state
  items: [],
  categories: [],
  locations: [],
  movements: [],
  auditLogs: [],
  valuationSnapshots: [],
  isLoading: false,
  error: null,
  filter: {},
  
  // Initialize from IndexedDB
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const [items, categories, locations, movements, auditLogs, valuationSnapshots] = await Promise.all([
        db.getAllItems(),
        db.getAllCategories(),
        db.getAllLocations(),
        db.getAllMovements(),
        db.getAllAuditLogs(),
        db.getAllValuationSnapshots(),
      ]);
      set({ items, categories, locations, movements, auditLogs, valuationSnapshots, isLoading: false });
      
      // Save recovery state after successful load
      await get().saveRecoveryState();
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },
  
  // Item actions
  addItem: async (itemData) => {
    // Check for duplicate SKU
    const existingItem = await db.getItemBySku(itemData.sku);
    if (existingItem) {
      throw new Error(`An item with SKU "${itemData.sku}" already exists: ${existingItem.name}`);
    }
    
    // Check location capacity if location is specified
    if (itemData.locationId) {
      const state = get();
      const location = state.locations.find(l => l.id === itemData.locationId);
      if (location?.capacity) {
        const currentTotal = calculateLocationTotal(itemData.locationId, state.items, state.movements);
        if (currentTotal > location.capacity) {
          throw new Error(
            `Location "${location.name}" is already at capacity. ` +
            `Current: ${currentTotal}, Capacity: ${location.capacity}`
          );
        }
      }
    }
    
    const now = new Date().toISOString();
    const item: InventoryItem = {
      ...itemData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    
    await db.saveItem(item);
    
    const auditLog = createAuditLog('item', item.id, 'create', { ...item });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      items: [...state.items, item],
      auditLogs: [...state.auditLogs, auditLog],
    }));
    
    // Save recovery state
    await get().saveRecoveryState();
    
    return item;
  },
  
  updateItem: async (id, updates) => {
    const { items, locations, movements } = get();
    const existingItem = items.find(i => i.id === id);
    if (!existingItem) throw new Error('Item not found');
    
    // Calculate quantity for this item
    const itemMovements = movements.filter(m => m.itemId === id);
    const currentQuantity = itemMovements.length > 0
      ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
      : 0;
    
    // Check if location is being changed - track for transfer movement
    const isLocationChange = updates.locationId !== undefined && 
                             updates.locationId !== existingItem.locationId;
    const fromLocationId = existingItem.locationId;
    const toLocationId = updates.locationId;
    
    // Check location capacity if location is being changed
    if (isLocationChange && toLocationId) {
      const location = locations.find(l => l.id === toLocationId);
      if (location?.capacity) {
        const currentTotal = calculateLocationTotal(toLocationId, items, movements);
        
        if (currentTotal + currentQuantity > location.capacity) {
          throw new Error(
            `Location "${location.name}" cannot hold this item. ` +
            `Current in location: ${currentTotal}, Item quantity: ${currentQuantity}, Capacity: ${location.capacity}`
          );
        }
      }
    }
    
    const now = new Date().toISOString();
    const updatedItem: InventoryItem = {
      ...existingItem,
      ...updates,
      id,
      createdAt: existingItem.createdAt,
      updatedAt: now,
    };
    
    await db.saveItem(updatedItem);
    
    // Create immutable transfer movement if location changed
    let transferMovement: StockMovement | null = null;
    if (isLocationChange && currentQuantity > 0) {
      transferMovement = {
        id: uuidv4(),
        itemId: id,
        type: 'transfer' as const,
        quantity: 0, // Transfer doesn't change quantity
        previousQuantity: currentQuantity,
        newQuantity: currentQuantity,
        fromLocationId: fromLocationId || null,
        toLocationId: toLocationId || null,
        reason: `Transfer from ${fromLocationId ? locations.find(l => l.id === fromLocationId)?.name || 'Unknown' : 'Unassigned'} to ${toLocationId ? locations.find(l => l.id === toLocationId)?.name || 'Unknown' : 'Unassigned'}`,
        timestamp: now,
      };
      await db.addMovement(transferMovement);
    }
    
    const auditLog = createAuditLog('item', id, 'update', {
      before: existingItem,
      after: updatedItem,
      changes: updates,
      transferMovementId: transferMovement?.id,
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      items: state.items.map(i => i.id === id ? updatedItem : i),
      movements: transferMovement ? [...state.movements, transferMovement] : state.movements,
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  deleteItem: async (id) => {
    const { items } = get();
    const existingItem = items.find(i => i.id === id);
    if (!existingItem) throw new Error('Item not found');
    
    await db.deleteItem(id);
    
    const auditLog = createAuditLog('item', id, 'delete', { ...existingItem });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      items: state.items.filter(i => i.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  // Category actions
  addCategory: async (categoryData) => {
    const now = new Date().toISOString();
    const category: Category = {
      ...categoryData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    
    await db.saveCategory(category);
    
    const auditLog = createAuditLog('category', category.id, 'create', { ...category });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      categories: [...state.categories, category],
      auditLogs: [...state.auditLogs, auditLog],
    }));
    
    return category;
  },
  
  updateCategory: async (id, updates) => {
    const { categories } = get();
    const existingCategory = categories.find(c => c.id === id);
    if (!existingCategory) throw new Error('Category not found');
    
    const updatedCategory: Category = {
      ...existingCategory,
      ...updates,
      id,
      createdAt: existingCategory.createdAt,
      updatedAt: new Date().toISOString(),
    };
    
    await db.saveCategory(updatedCategory);
    
    const auditLog = createAuditLog('category', id, 'update', {
      before: existingCategory,
      after: updatedCategory,
      changes: updates,
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      categories: state.categories.map(c => c.id === id ? updatedCategory : c),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  deleteCategory: async (id) => {
    const { categories, items } = get();
    const existingCategory = categories.find(c => c.id === id);
    if (!existingCategory) throw new Error('Category not found');
    
    // Check for items using this category
    const itemsUsingCategory = items.filter(i => i.categoryId === id);
    if (itemsUsingCategory.length > 0) {
      // Set categoryId to null for affected items
      for (const item of itemsUsingCategory) {
        await get().updateItem(item.id, { categoryId: null });
      }
    }
    
    await db.deleteCategory(id);
    
    const auditLog = createAuditLog('category', id, 'delete', { ...existingCategory });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      categories: state.categories.filter(c => c.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  // Location actions
  addLocation: async (locationData) => {
    const now = new Date().toISOString();
    const location: Location = {
      ...locationData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    
    await db.saveLocation(location);
    
    const auditLog = createAuditLog('location', location.id, 'create', { ...location });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      locations: [...state.locations, location],
      auditLogs: [...state.auditLogs, auditLog],
    }));
    
    return location;
  },
  
  updateLocation: async (id, updates) => {
    const { locations } = get();
    const existingLocation = locations.find(l => l.id === id);
    if (!existingLocation) throw new Error('Location not found');
    
    const updatedLocation: Location = {
      ...existingLocation,
      ...updates,
      id,
      createdAt: existingLocation.createdAt,
      updatedAt: new Date().toISOString(),
    };
    
    await db.saveLocation(updatedLocation);
    
    const auditLog = createAuditLog('location', id, 'update', {
      before: existingLocation,
      after: updatedLocation,
      changes: updates,
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      locations: state.locations.map(l => l.id === id ? updatedLocation : l),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  deleteLocation: async (id) => {
    const { locations, items } = get();
    const existingLocation = locations.find(l => l.id === id);
    if (!existingLocation) throw new Error('Location not found');
    
    // Set locationId to null for affected items
    const itemsUsingLocation = items.filter(i => i.locationId === id);
    for (const item of itemsUsingLocation) {
      await get().updateItem(item.id, { locationId: null });
    }
    
    await db.deleteLocation(id);
    
    const auditLog = createAuditLog('location', id, 'delete', { ...existingLocation });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      locations: state.locations.filter(l => l.id !== id),
      auditLogs: [...state.auditLogs, auditLog],
    }));
  },
  
  // Movement actions
  // In your store's recordMovement function
recordMovement: async (
  itemId: string,
  type: MovementType,
  quantity: number,
  reason?: string,
  fromLocationId?: string,
  toLocationId?: string
) => {
  const state = get();
  const { items, movements, locations } = state;
  const item = items.find(i => i.id === itemId);
  if (!item) throw new Error('Item not found');
  
  // Calculate current quantity from movements
  const itemMovements = movements.filter(m => m.itemId === itemId);
  const currentQuantity = itemMovements.length > 0
    ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
    : 0;
  
  // For inbound movements, check location capacity
  if (type === 'inbound' && item.locationId) {
    const location = locations.find(l => l.id === item.locationId);
    if (location?.capacity) {
      const currentTotal = calculateLocationTotal(item.locationId, items, movements);
      
      if (currentTotal + quantity > location.capacity) {
        const availableCapacity = location.capacity - currentTotal;
        throw new Error(
          `Location "${location.name}" cannot hold ${quantity} more items. ` +
          `Current: ${currentTotal}, Capacity: ${location.capacity}, ` +
          `Available: ${Math.max(0, availableCapacity)}`
        );
      }
    }
  }
  
  // For outbound movements, check if enough stock exists
  if (type === 'outbound') {
    if (quantity > currentQuantity) {
      throw new Error(
        `Cannot remove ${quantity} items. Only ${currentQuantity} available.`
      );
    }
  }
  
  // Calculate new quantity
  let newQuantity: number;
  switch (type) {
    case 'inbound':
      newQuantity = currentQuantity + Math.abs(quantity);
      break;
    case 'outbound':
      newQuantity = Math.max(0, currentQuantity - Math.abs(quantity));
      break;
    case 'adjustment':
    case 'correction':
      newQuantity = Math.max(0, currentQuantity + quantity);
      break;
    case 'transfer':
      newQuantity = currentQuantity; // Transfer doesn't change quantity for the item itself
      break;
    default:
      newQuantity = currentQuantity;
  }
  
  const movement: StockMovement = {
    id: uuidv4(),
    itemId,
    type,
    quantity: type === 'outbound' ? -Math.abs(quantity) : quantity,
    previousQuantity: currentQuantity,
    newQuantity,
    fromLocationId: fromLocationId || null,
    toLocationId: toLocationId || null,
    reason,
    timestamp: new Date().toISOString(),
  };
  
  await db.addMovement(movement);
  
  // Add audit log for stock movement
  const auditLog = createAuditLog('movement', movement.id, 'create', {
    itemId,
    itemName: item.name,
    itemSku: item.sku,
    type,
    quantity: movement.quantity,
    previousQuantity: currentQuantity,
    newQuantity,
    reason,
    fromLocationId,
    toLocationId,
  });
  await db.addAuditLog(auditLog);
  
  set(state => ({
    movements: [...state.movements, movement],
    auditLogs: [...state.auditLogs, auditLog],
  }));
  
  return movement;
},

  // Explicit transfer: updates item location AND creates immutable transfer movement
  recordTransfer: async (itemId, toLocationId, reason) => {
    const { items, movements, locations } = get();
    const item = items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found');
    
    const fromLocationId = item.locationId;
    
    // No-op if location isn't changing
    if (fromLocationId === toLocationId) {
      throw new Error('Item is already at this location');
    }
    
    // Calculate current quantity
    const itemMovements = movements.filter(m => m.itemId === itemId);
    const currentQuantity = itemMovements.length > 0
      ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
      : 0;
    
    if (currentQuantity <= 0) {
      throw new Error('Cannot transfer item with zero quantity');
    }
    
    // Check destination capacity
    if (toLocationId) {
      const toLocation = locations.find(l => l.id === toLocationId);
      if (toLocation?.capacity) {
        const currentTotal = calculateLocationTotal(toLocationId, items, movements);
        if (currentTotal + currentQuantity > toLocation.capacity) {
          throw new Error(
            `Location "${toLocation.name}" cannot hold this item. ` +
            `Current: ${currentTotal}, Item quantity: ${currentQuantity}, Capacity: ${toLocation.capacity}`
          );
        }
      }
    }
    
    const now = new Date().toISOString();
    const fromLocationName = fromLocationId 
      ? locations.find(l => l.id === fromLocationId)?.name || 'Unknown'
      : 'Unassigned';
    const toLocationName = toLocationId
      ? locations.find(l => l.id === toLocationId)?.name || 'Unknown'
      : 'Unassigned';
    
    // Create transfer movement
    const movement: StockMovement = {
      id: uuidv4(),
      itemId,
      type: 'transfer' as const,
      quantity: 0, // Transfer doesn't change quantity
      previousQuantity: currentQuantity,
      newQuantity: currentQuantity,
      fromLocationId: fromLocationId || null,
      toLocationId: toLocationId || null,
      reason: reason || `Transfer from ${fromLocationName} to ${toLocationName}`,
      timestamp: now,
    };
    
    // Update item location
    const updatedItem: InventoryItem = {
      ...item,
      locationId: toLocationId,
      updatedAt: now,
    };
    
    await db.saveItem(updatedItem);
    await db.addMovement(movement);
    
    // Create audit log
    const auditLog = createAuditLog('movement', movement.id, 'create', {
      itemId,
      itemName: item.name,
      itemSku: item.sku,
      type: 'transfer',
      fromLocationId,
      toLocationId,
      fromLocationName,
      toLocationName,
      quantity: currentQuantity,
      reason: movement.reason,
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      items: state.items.map(i => i.id === itemId ? updatedItem : i),
      movements: [...state.movements, movement],
      auditLogs: [...state.auditLogs, auditLog],
    }));
    
    return movement;
  },
  
  // Explicit correction: adjusts quantity with required reason
  recordCorrection: async (itemId, newQuantity, reason) => {
    const { items, movements } = get();
    const item = items.find(i => i.id === itemId);
    if (!item) throw new Error('Item not found');
    
    if (!reason || reason.trim().length === 0) {
      throw new Error('Correction requires a reason');
    }
    
    if (newQuantity < 0) {
      throw new Error('Quantity cannot be negative');
    }
    
    // Calculate current quantity
    const itemMovements = movements.filter(m => m.itemId === itemId);
    const currentQuantity = itemMovements.length > 0
      ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
      : 0;
    
    const quantityDiff = newQuantity - currentQuantity;
    
    if (quantityDiff === 0) {
      throw new Error('New quantity is the same as current quantity');
    }
    
    const now = new Date().toISOString();
    
    // Create correction movement
    const movement: StockMovement = {
      id: uuidv4(),
      itemId,
      type: 'correction' as const,
      quantity: quantityDiff,
      previousQuantity: currentQuantity,
      newQuantity,
      fromLocationId: null,
      toLocationId: null,
      reason: reason.trim(),
      timestamp: now,
    };
    
    await db.addMovement(movement);
    
    // Create audit log
    const auditLog = createAuditLog('movement', movement.id, 'create', {
      itemId,
      itemName: item.name,
      itemSku: item.sku,
      type: 'correction',
      previousQuantity: currentQuantity,
      newQuantity,
      quantityDiff,
      reason: reason.trim(),
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      movements: [...state.movements, movement],
      auditLogs: [...state.auditLogs, auditLog],
    }));
    
    return movement;
  },

  
  // Bulk operations with transaction support
  bulkUpdateItems: async (edit) => {
    const { items, movements, locations } = get();
    
    // Validate all items exist before starting
    const itemsToUpdate = items.filter(i => edit.itemIds.includes(i.id));
    if (itemsToUpdate.length !== edit.itemIds.length) {
      const missingIds = edit.itemIds.filter(id => !items.find(i => i.id === id));
      throw new Error(`Some items not found: ${missingIds.join(', ')}`);
    }
    
    // Store original state for rollback
    const originalItems = itemsToUpdate.map(item => ({ ...item }));
    const now = new Date().toISOString();
    
    // Check if this is a location change (for transfer movements)
    const isLocationChange = edit.updates.locationId !== undefined;
    const toLocationId = edit.updates.locationId;
    
    // Prepare all updated items
    const updatedItemsData = itemsToUpdate.map(item => ({
      ...item,
      ...edit.updates,
      updatedAt: now,
    }));
    
    // Prepare transfer movements for location changes
    const transferMovements: StockMovement[] = [];
    if (isLocationChange) {
      for (const item of itemsToUpdate) {
        // Only create transfer if location actually changed
        if (item.locationId !== toLocationId) {
          const itemMovements = movements.filter(m => m.itemId === item.id);
          const currentQuantity = itemMovements.length > 0
            ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
            : 0;
          
          if (currentQuantity > 0) {
            transferMovements.push({
              id: uuidv4(),
              itemId: item.id,
              type: 'transfer' as const,
              quantity: 0, // Transfer doesn't change quantity
              previousQuantity: currentQuantity,
              newQuantity: currentQuantity,
              fromLocationId: item.locationId || null,
              toLocationId: toLocationId || null,
              reason: `Bulk transfer from ${item.locationId ? locations.find(l => l.id === item.locationId)?.name || 'Unknown' : 'Unassigned'} to ${toLocationId ? locations.find(l => l.id === toLocationId)?.name || 'Unknown' : 'Unassigned'}`,
              timestamp: now,
            });
          }
        }
      }
    }
    
    try {
      // Use single batched transaction for atomicity
      await db.bulkSaveItems(updatedItemsData);
      
      // Add transfer movements
      for (const movement of transferMovements) {
        await db.addMovement(movement);
      }
      
      // Update state after successful DB write
      set(state => ({
        items: state.items.map(item => {
          const updatedItem = updatedItemsData.find(u => u.id === item.id);
          return updatedItem || item;
        }),
        movements: transferMovements.length > 0 
          ? [...state.movements, ...transferMovements] 
          : state.movements,
      }));
      
      // Create audit logs for all updates in batch
      const auditLogs = updatedItemsData.map(item => {
        const transferMovement = transferMovements.find(m => m.itemId === item.id);
        return {
          id: uuidv4(),
          entityType: 'item' as const,
          entityId: item.id,
          action: 'update' as const,
          changes: {
            ...edit.updates,
            transferMovementId: transferMovement?.id,
          },
          timestamp: now,
        };
      });
      
      // Add audit logs
      for (const log of auditLogs) {
        await db.addAuditLog(log);
      }
      
      set(state => ({
        auditLogs: [...state.auditLogs, ...auditLogs],
      }));
    } catch (error) {
      // Rollback: restore original items using batched transaction
      try {
        await db.bulkSaveItems(originalItems);
        // Reload state to ensure consistency
        await get().initialize();
      } catch (rollbackError) {
        console.error('Rollback also failed:', rollbackError);
      }
      throw new Error(`Bulk update failed and was rolled back: ${(error as Error).message}`);
    }
  },
  
  bulkImport: async (data) => {
    // Store current state for rollback
    const currentState = get();
    const backup = {
      items: [...currentState.items],
      categories: [...currentState.categories],
      locations: [...currentState.locations],
      movements: [...currentState.movements],
      auditLogs: [...currentState.auditLogs],
    };
    
    try {
      // Clear existing data first
      await db.clearAll();
      
      // Import categories
      for (const category of data.categories) {
        await db.saveCategory(category);
      }
      
      // Import locations
      for (const location of data.locations) {
        await db.saveLocation(location);
      }
      
      // Import items
      for (const item of data.items) {
        await db.saveItem(item);
      }
      
      // Import movements
      for (const movement of data.movements) {
        await db.addMovement(movement);
      }
      
      // Import audit logs
      for (const log of data.auditLogs) {
        await db.addAuditLog(log);
      }
      
      // Reload state
      await get().initialize();
    } catch (error) {
      // Rollback: restore backup
      console.error('Bulk import failed, attempting rollback:', error);
      try {
        await db.clearAll();
        for (const category of backup.categories) await db.saveCategory(category);
        for (const location of backup.locations) await db.saveLocation(location);
        for (const item of backup.items) await db.saveItem(item);
        for (const movement of backup.movements) await db.addMovement(movement);
        for (const log of backup.auditLogs) await db.addAuditLog(log);
        await get().initialize();
      } catch (rollbackError) {
        console.error('Rollback also failed:', rollbackError);
      }
      throw new Error(`Bulk import failed and was rolled back: ${(error as Error).message}`);
    }
  },
  
  // Filter actions
  setFilter: (filter) => {
    set(state => ({
      filter: { ...state.filter, ...filter },
    }));
    // Trigger debounced recovery state save for persistence
    if (debouncedSaveRecoveryState) {
      debouncedSaveRecoveryState();
    }
  },
  
  clearFilter: () => {
    set({ filter: {} });
  },
  
  // Export
  exportData: () => {
    const { items, categories, locations, movements, auditLogs } = get();
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      items,
      categories,
      locations,
      movements,
      auditLogs,
    };
  },
  
  exportCSV: () => {
    const { items, movements } = get();
    const enrichedItems = enrichItemsWithQuantities(items, movements);
    
    const headers = ['SKU', 'Name', 'Category', 'Location', 'Quantity', 'Unit Cost', 'Total Value', 'Status'];
    const rows = enrichedItems.map(item => [
      item.sku,
      item.name,
      item.categoryId || '',
      item.locationId || '',
      item.quantity.toString(),
      item.unitCost.toString(),
      item.totalValue.toString(),
      item.lifecycleStatus,
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  },
  
  // Export valuation summary
  exportValuationSummary: () => {
    const state = get();
    const { items, movements, categories, locations } = state;
    const enrichedItems = enrichItemsWithQuantities(items, movements);
    const health = calculateInventoryHealth(items, movements);
    const valueByCategory = calculateValueByCategory(items, movements);
    const valueByLocation = calculateValueByLocation(items, movements);
    
    const totalValue = enrichedItems.reduce((sum, item) => sum + item.totalValue, 0);
    const totalQuantity = enrichedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    return {
      exportedAt: new Date().toISOString(),
      summary: {
        totalItems: items.length,
        totalQuantity,
        totalValue: Math.round(totalValue * 100) / 100,
        averageItemValue: items.length > 0 ? Math.round((totalValue / items.length) * 100) / 100 : 0,
      },
      healthMetrics: health,
      categoryBreakdown: Object.entries(valueByCategory).map(([categoryId, value]) => ({
        categoryId,
        categoryName: categories.find(c => c.id === categoryId)?.name || 'Uncategorized',
        value: Math.round(value * 100) / 100,
        itemCount: enrichedItems.filter(i => i.categoryId === categoryId).length,
      })),
      locationBreakdown: Object.entries(valueByLocation).map(([locationId, value]) => ({
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || 'Unassigned',
        value: Math.round(value * 100) / 100,
        itemCount: enrichedItems.filter(i => i.locationId === locationId).length,
      })),
    };
  },
  
  // Export analytics snapshot
  exportAnalyticsSnapshot: () => {
    const state = get();
    const { items, movements, categories, locations } = state;
    const enrichedItems = enrichItemsWithQuantities(items, movements);
    const health = calculateInventoryHealth(items, movements);
    
    // Calculate expiration risk
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringItems = enrichedItems.filter(item => {
      if (!item.expirationDate) return false;
      const expDate = new Date(item.expirationDate);
      return expDate <= thirtyDaysFromNow && expDate > now;
    });
    const expiredItems = enrichedItems.filter(item => {
      if (!item.expirationDate) return false;
      return new Date(item.expirationDate) <= now;
    });
    
    // Calculate shrinkage (items with negative adjustments)
    const shrinkageMovements = movements.filter(m => 
      m.type === 'adjustment' && m.quantity < 0
    );
    const shrinkageValue = shrinkageMovements.reduce((sum, m) => {
      const item = items.find(i => i.id === m.itemId);
      return sum + (item ? Math.abs(m.quantity) * item.unitCost : 0);
    }, 0);
    
    // Low stock analysis
    const lowStockItems = enrichedItems.filter(item => item.isLowStock);
    const outOfStockItems = enrichedItems.filter(item => item.quantity === 0);
    
    return {
      snapshotAt: new Date().toISOString(),
      inventoryHealth: health,
      expirationRisk: {
        expiredCount: expiredItems.length,
        expiredValue: expiredItems.reduce((sum, i) => sum + i.totalValue, 0),
        expiringIn30DaysCount: expiringItems.length,
        expiringIn30DaysValue: expiringItems.reduce((sum, i) => sum + i.totalValue, 0),
        expiredItems: expiredItems.map(i => ({ id: i.id, name: i.name, sku: i.sku, expirationDate: i.expirationDate })),
        expiringItems: expiringItems.map(i => ({ id: i.id, name: i.name, sku: i.sku, expirationDate: i.expirationDate })),
      },
      shrinkageIndicators: {
        totalShrinkageEvents: shrinkageMovements.length,
        totalShrinkageValue: Math.round(shrinkageValue * 100) / 100,
        shrinkageRate: movements.length > 0 ? Math.round((shrinkageMovements.length / movements.length) * 10000) / 100 : 0,
      },
      stockStatus: {
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        healthyStockCount: enrichedItems.length - lowStockItems.length - outOfStockItems.length,
        lowStockItems: lowStockItems.map(i => ({ id: i.id, name: i.name, sku: i.sku, quantity: i.quantity, threshold: i.reorderThreshold })),
      },
    };
  },
  
  // Valuation snapshots
  addValuationSnapshot: async () => {
    const state = get();
    const { items, movements, categories, locations } = state;
    const valueByCategory = calculateValueByCategory(items, movements);
    const valueByLocation = calculateValueByLocation(items, movements);
    const totalValue = calculateTotalInventoryValue(items, movements);
    
    const snapshot: ValuationSnapshot = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      totalValue: Math.round(totalValue * 100) / 100,
      itemCount: items.length,
      categoryBreakdown: valueByCategory,
      locationBreakdown: valueByLocation,
    };
    
    await db.addValuationSnapshot(snapshot);
    
    set(state => ({
      valuationSnapshots: [...state.valuationSnapshots, snapshot],
    }));
    
    return snapshot;
  },
  
  // Recovery methods
  saveRecoveryState: async () => {
    const state = get();
    await db.saveRecoveryState({
      items: state.items,
      categories: state.categories,
      locations: state.locations,
      movements: state.movements,
      auditLogs: state.auditLogs,
    });
  },
  
  loadRecoveryState: async () => {
    const recoveryData = await db.loadRecoveryState();
    if (recoveryData) {
      set({
        items: recoveryData.state.items,
        categories: recoveryData.state.categories,
        locations: recoveryData.state.locations,
        movements: recoveryData.state.movements || [],
        auditLogs: recoveryData.state.auditLogs || [],
      });
      await db.clearRecoveryState();
    }
  },
  
  needsRecovery: async () => {
    return await db.needsRecovery();
  },
}));

// Initialize debounced recovery state persistence (300ms delay)
debouncedSaveRecoveryState = debounce(() => {
  useInventoryStore.getState().saveRecoveryState();
}, 300);

// Memoized selectors
export const selectEnrichedItems = (state: InventoryState): InventoryItemWithQuantity[] => {
  return enrichItemsWithQuantities(state.items, state.movements);
};

export const selectFilteredItems = (state: InventoryState): InventoryItemWithQuantity[] => {
  let items = selectEnrichedItems(state);
  const { filter } = state;
  
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
};

export const selectTotalValue = (state: InventoryState): number => {
  return calculateTotalInventoryValue(state.items, state.movements);
};

export const selectValueByCategory = (state: InventoryState): Record<string, number> => {
  return calculateValueByCategory(state.items, state.movements);
};

export const selectValueByLocation = (state: InventoryState): Record<string, number> => {
  return calculateValueByLocation(state.items, state.movements);
};

export const selectInventoryHealth = (state: InventoryState) => {
  return calculateInventoryHealth(state.items, state.movements);
};

export const selectLowStockItems = (state: InventoryState): InventoryItemWithQuantity[] => {
  return selectEnrichedItems(state).filter(item => item.isLowStock);
};

export const selectItemsByCategory = (state: InventoryState, categoryId: string | null): InventoryItemWithQuantity[] => {
  return selectEnrichedItems(state).filter(item => item.categoryId === categoryId);
};

export const selectItemsByLocation = (state: InventoryState, locationId: string | null): InventoryItemWithQuantity[] => {
  return selectEnrichedItems(state).filter(item => item.locationId === locationId);
};

export const selectMovementsByItem = (state: InventoryState, itemId: string): StockMovement[] => {
  return state.movements.filter(m => m.itemId === itemId);
};

export const selectAuditLogsByEntity = (state: InventoryState, entityId: string): AuditLog[] => {
  return state.auditLogs.filter(log => log.entityId === entityId);
};
