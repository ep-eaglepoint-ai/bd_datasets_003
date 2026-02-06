import { z } from 'zod';

// Lifecycle states for inventory items
export const LifecycleStatus = z.enum([
  'active',
  'reserved',
  'damaged',
  'expired',
  'archived',
  'disposed'
]);
export type LifecycleStatus = z.infer<typeof LifecycleStatus>;

// Movement types for stock tracking
export const MovementType = z.enum([
  'inbound',
  'outbound',
  'transfer',
  'adjustment',
  'correction'
]);
export type MovementType = z.infer<typeof MovementType>;

// Category schema
export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

// Location schema
export const LocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Location name is required'),
  description: z.string().optional(),
  zone: z.string().optional(),
  capacity: z.number().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Location = z.infer<typeof LocationSchema>;

// Inventory item schema with Zod validation
export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Item name is required'),
  sku: z.string().min(1, 'SKU is required'),
  categoryId: z.string().uuid().nullable(),
  locationId: z.string().uuid().nullable(),
  unitCost: z.number().nonnegative('Unit cost must be non-negative'),
  reorderThreshold: z.number().int().nonnegative('Reorder threshold must be non-negative'),
  supplierNotes: z.string().optional(),
  lifecycleStatus: LifecycleStatus,
  expirationDate: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

// Stock movement schema - immutable log entry
export const StockMovementSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  type: MovementType,
  quantity: z.number().int(), // Can be negative for outbound/adjustments
  previousQuantity: z.number().int().nonnegative(),
  newQuantity: z.number().int().nonnegative(),
  fromLocationId: z.string().uuid().nullable().optional(),
  toLocationId: z.string().uuid().nullable().optional(),
  reason: z.string().optional(),
  reference: z.string().optional(),
  timestamp: z.string().datetime(),
  // Immutable - no updatedAt field
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

// Audit log schema for tracking all changes
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['item', 'category', 'location', 'movement']),
  entityId: z.string().uuid(),
  action: z.enum(['create', 'update', 'delete', 'restore']),
  changes: z.record(z.any()),
  timestamp: z.string().datetime(),
  // Immutable - no updatedAt field
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

// Valuation snapshot for historical tracking
export const ValuationSnapshotSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  totalValue: z.number().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  categoryBreakdown: z.record(z.number().nonnegative()),
  locationBreakdown: z.record(z.number().nonnegative()),
});
export type ValuationSnapshot = z.infer<typeof ValuationSnapshotSchema>;

// Item with computed quantity (derived from movements)
export const InventoryItemWithQuantitySchema = InventoryItemSchema.extend({
  quantity: z.number().int().nonnegative(),
  totalValue: z.number().nonnegative(),
  isLowStock: z.boolean(),
});
export type InventoryItemWithQuantity = z.infer<typeof InventoryItemWithQuantitySchema>;

// Inventory health metrics
export const InventoryHealthSchema = z.object({
  totalItems: z.number().int().nonnegative(),
  totalValue: z.number().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
  deadStockRatio: z.number().min(0).max(1),
  replenishmentEfficiency: z.number().min(0).max(1),
  stockAgingDays: z.number().nonnegative(),
  demandConsistency: z.number().min(0).max(1),
  turnoverRate: z.number().nonnegative(),
  overallHealthScore: z.number().min(0).max(100),
});
export type InventoryHealth = z.infer<typeof InventoryHealthSchema>;

// Export/Import data structure
export const ExportDataSchema = z.object({
  version: z.string(),
  exportedAt: z.string().datetime(),
  items: z.array(InventoryItemSchema),
  categories: z.array(CategorySchema),
  locations: z.array(LocationSchema),
  movements: z.array(StockMovementSchema),
  auditLogs: z.array(AuditLogSchema),
});
export type ExportData = z.infer<typeof ExportDataSchema>;

// Bulk operation schemas
export const BulkEditSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, 'At least one item is required'),
  updates: z.object({
    categoryId: z.string().uuid().nullable().optional(),
    locationId: z.string().uuid().nullable().optional(),
    lifecycleStatus: LifecycleStatus.optional(),
    reorderThreshold: z.number().int().nonnegative().optional(),
  }),
});
export type BulkEdit = z.infer<typeof BulkEditSchema>;

// Filter schema for searching
export const FilterSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  lifecycleStatus: LifecycleStatus.optional(),
  lowStockOnly: z.boolean().optional(),
  sortBy: z.enum(['name', 'sku', 'quantity', 'unitCost', 'totalValue', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type Filter = z.infer<typeof FilterSchema>;
