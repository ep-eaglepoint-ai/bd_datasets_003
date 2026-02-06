'use client';

import { useState, useMemo, useCallback } from 'react';
import { useInventoryStore, selectFilteredItems } from '@/lib/store';
import { InventoryItemWithQuantity, LifecycleStatus } from '@/lib/schemas';
import { Search, Filter, Edit, Trash2, Plus, Minus, ArrowUpDown } from 'lucide-react';
import { FixedSizeList as List } from 'react-window';

interface InventoryListProps {
  onEditItem: (itemId: string) => void;
}

export function InventoryList({ onEditItem }: InventoryListProps) {
  const { categories, locations, deleteItem, recordMovement, setFilter, filter } = useInventoryStore();
  const filteredItems = useInventoryStore(selectFilteredItems);
  
  const [showFilters, setShowFilters] = useState(false);
  const [movementModal, setMovementModal] = useState<{ itemId: string; type: 'inbound' | 'outbound' } | null>(null);
  const [movementQuantity, setMovementQuantity] = useState(1);
  const [movementReason, setMovementReason] = useState('');
  
  const handleDelete = async (item: InventoryItemWithQuantity) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      await deleteItem(item.id);
    }
  };
  
  const handleMovement = async () => {
  if (!movementModal) return;

  // check if movement quantity is valid
  if (movementQuantity <= 0) {
    alert('Movement quantity must be greater than 0');
    return;
  }

  try {
    await recordMovement(
      movementModal.itemId,
      movementModal.type,
      movementQuantity,
      movementReason || undefined
    );
    
    setMovementModal(null);
    setMovementQuantity(1);
    setMovementReason('');
  } catch (error) {
    alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
  
  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Unknown';
  };
  
  const getLocationName = (locationId: string | null) => {
    if (!locationId) return 'Unassigned';
    const location = locations.find(l => l.id === locationId);
    return location?.name || 'Unknown';
  };
  
  const getStatusColor = (status: LifecycleStatus) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'reserved': return 'bg-blue-100 text-blue-800';
      case 'damaged': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-purple-100 text-purple-800';
      case 'disposed': return 'bg-gray-300 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const handleSort = (field: string) => {
    if (filter.sortBy === field) {
      setFilter({ sortOrder: filter.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilter({ sortBy: field as any, sortOrder: 'asc' });
    }
  };
  
  // Virtualized row renderer
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = filteredItems[index];
    return (
      <div style={style} className="flex items-center justify-between border-b hover:bg-gray-50 px-4">
        <div className="w-1/6 py-3">
          <p className="font-medium text-gray-900">{item.name}</p>
          <p className="text-sm text-gray-500">{item.sku}</p>
        </div>
        <div className="w-1/8 py-3 text-sm">{getCategoryName(item.categoryId)}</div>
        <div className="w-1/8 py-3 text-sm">{getLocationName(item.locationId)}</div>
        <div className="w-1/8 py-3">
          <span className={`font-medium ${item.isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
            {item.quantity}
          </span>
          {item.isLowStock && (
            <span className="ml-1 text-xs text-red-500">(Low)</span>
          )}
        </div>
        <div className="w-1/8 py-3 text-sm">${item.unitCost.toFixed(2)}</div>
        <div className="w-1/8 py-3 text-sm font-medium">${item.totalValue.toFixed(2)}</div>
        <div className="w-1/8 py-3">
          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.lifecycleStatus)}`}>
            {item.lifecycleStatus}
          </span>
        </div>
        <div className="w-1/8 py-3 flex gap-1">
          <button
            onClick={() => setMovementModal({ itemId: item.id, type: 'inbound' })}
            className="p-1 hover:bg-green-100 rounded text-green-600"
            title="Add Stock"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setMovementModal({ itemId: item.id, type: 'outbound' })}
            className="p-1 hover:bg-red-100 rounded text-red-600"
            title="Remove Stock"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => onEditItem(item.id)}
            className="p-1 hover:bg-blue-100 rounded text-blue-600"
            title="Edit"
          >
            <Edit size={16} />
          </button>
          <button
            onClick={() => handleDelete(item)}
            className="p-1 hover:bg-red-100 rounded text-red-600"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }, [filteredItems, categories, locations]);
  
  return (
    <div className="bg-white rounded-lg shadow">
      {/* Search and Filter Bar */}
      <div className="p-4 border-b">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search items..."
              value={filter.search || ''}
              onChange={(e) => setFilter({ search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${showFilters ? 'bg-blue-50 border-blue-500' : ''}`}
          >
            <Filter size={20} />
            Filters
          </button>
        </div>
        
        {/* Filter Options */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <select
              value={filter.categoryId || ''}
              onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            
            <select
              value={filter.locationId || ''}
              onChange={(e) => setFilter({ locationId: e.target.value || undefined })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            
            <select
              value={filter.lifecycleStatus || ''}
              onChange={(e) => setFilter({ lifecycleStatus: e.target.value as LifecycleStatus || undefined })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="reserved">Reserved</option>
              <option value="damaged">Damaged</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
              <option value="disposed">Disposed</option>
            </select>
            
            <label className="flex items-center gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={filter.lowStockOnly || false}
                onChange={(e) => setFilter({ lowStockOnly: e.target.checked })}
                className="rounded"
              />
              Low Stock Only
            </label>
          </div>
        )}
      </div>
      
      {/* Table Header */}
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 font-medium text-sm text-gray-600">
        <div className="w-1/6 py-3 cursor-pointer flex items-center gap-1" onClick={() => handleSort('name')}>
          Item <ArrowUpDown size={14} />
        </div>
        <div className="w-1/8 py-3">Category</div>
        <div className="w-1/8 py-3">Location</div>
        <div className="w-1/8 py-3 cursor-pointer flex items-center gap-1" onClick={() => handleSort('quantity')}>
          Qty <ArrowUpDown size={14} />
        </div>
        <div className="w-1/8 py-3 cursor-pointer flex items-center gap-1" onClick={() => handleSort('unitCost')}>
          Unit Cost <ArrowUpDown size={14} />
        </div>
        <div className="w-1/8 py-3 cursor-pointer flex items-center gap-1" onClick={() => handleSort('totalValue')}>
          Total Value <ArrowUpDown size={14} />
        </div>
        <div className="w-1/8 py-3">Status</div>
        <div className="w-1/8 py-3">Actions</div>
      </div>
      
      {/* Virtualized List */}
      {filteredItems.length > 0 ? (
        <List
          height={500}
          itemCount={filteredItems.length}
          itemSize={60}
          width="100%"
        >
          {Row}
        </List>
      ) : (
        <div className="p-8 text-center text-gray-500">
          No items found. Add your first item to get started.
        </div>
      )}
      
      {/* Movement Modal */}
      {movementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              {movementModal.type === 'inbound' ? 'Add Stock' : 'Remove Stock'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={movementQuantity}
                  onChange={(e) => setMovementQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Purchase order #123"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setMovementModal(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMovement}
                  className={`px-4 py-2 rounded-lg text-white ${
                    movementModal.type === 'inbound' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {movementModal.type === 'inbound' ? 'Add' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
