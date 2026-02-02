import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  InventoryItem, 
  Category, 
  Location, 
  StockMovement, 
  AuditLog,
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

interface InventoryState {
  // Data
  items: InventoryItem[];
  categories: Category[];
  locations: Location[];
  movements: StockMovement[];
  auditLogs: AuditLog[];
  
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
  
  // Bulk operations
  bulkUpdateItems: (edit: BulkEdit) => Promise<void>;
  bulkImport: (data: ExportData) => Promise<void>;
  
  // Filter actions
  setFilter: (filter: Partial<Filter>) => void;
  clearFilter: () => void;
  
  // Export
  exportData: () => ExportData;
  exportCSV: () => string;
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
  isLoading: false,
  error: null,
  filter: {},
  
  // Initialize from IndexedDB
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const [items, categories, locations, movements, auditLogs] = await Promise.all([
        db.getAllItems(),
        db.getAllCategories(),
        db.getAllLocations(),
        db.getAllMovements(),
        db.getAllAuditLogs(),
      ]);
      set({ items, categories, locations, movements, auditLogs, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },
  
  // Item actions
  addItem: async (itemData) => {
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
    
    return item;
  },
  
  updateItem: async (id, updates) => {
    const { items, locations, movements } = get();
    const existingItem = items.find(i => i.id === id);
    if (!existingItem) throw new Error('Item not found');
    
    // Check location capacity if location is being changed
    if (updates.locationId && updates.locationId !== existingItem.locationId) {
      const location = locations.find(l => l.id === updates.locationId);
      if (location?.capacity) {
        // Calculate quantity for this item
        const itemMovements = movements.filter(m => m.itemId === id);
        const currentQuantity = itemMovements.length > 0
          ? itemMovements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].newQuantity
          : 0;
        
        const currentTotal = calculateLocationTotal(updates.locationId, items, movements);
        
        if (currentTotal + currentQuantity > location.capacity) {
          throw new Error(
            `Location "${location.name}" cannot hold this item. ` +
            `Current in location: ${currentTotal}, Item quantity: ${currentQuantity}, Capacity: ${location.capacity}`
          );
        }
      }
    }
    
    const updatedItem: InventoryItem = {
      ...existingItem,
      ...updates,
      id,
      createdAt: existingItem.createdAt,
      updatedAt: new Date().toISOString(),
    };
    
    await db.saveItem(updatedItem);
    
    const auditLog = createAuditLog('item', id, 'update', {
      before: existingItem,
      after: updatedItem,
      changes: updates,
    });
    await db.addAuditLog(auditLog);
    
    set(state => ({
      items: state.items.map(i => i.id === id ? updatedItem : i),
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
  
  set(state => ({
    movements: [...state.movements, movement],
  }));
  
  return movement;
},

  
  // Bulk operations
  bulkUpdateItems: async (edit) => {
    const { items } = get();
    const itemsToUpdate = items.filter(i => edit.itemIds.includes(i.id));
    
    for (const item of itemsToUpdate) {
      await get().updateItem(item.id, edit.updates);
    }
  },
  
  bulkImport: async (data) => {
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
  },
  
  // Filter actions
  setFilter: (filter) => {
    set(state => ({
      filter: { ...state.filter, ...filter },
    }));
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
}));

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
