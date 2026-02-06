'use client';

import { useState } from 'react';
import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { LifecycleStatus } from '@/lib/schemas';
import { Edit, Trash2, Package } from 'lucide-react';

export function BulkOperations() {
  const { items, categories, locations, bulkUpdateItems, updateItem } = useInventoryStore();
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [bulkEdit, setBulkEdit] = useState<{
    categoryId?: string | null;
    locationId?: string | null;
    lifecycleStatus?: LifecycleStatus;
    reorderThreshold?: number;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleSelectAll = () => {
    if (selectedItemIds.length === enrichedItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(enrichedItems.map(item => item.id));
    }
  };

  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleBulkUpdate = async () => {
    if (selectedItemIds.length === 0) {
      setError('No items selected');
      return;
    }

    // Filter out undefined values
    const updates: any = {};
    if (bulkEdit.categoryId !== undefined) updates.categoryId = bulkEdit.categoryId;
    if (bulkEdit.locationId !== undefined) updates.locationId = bulkEdit.locationId;
    if (bulkEdit.lifecycleStatus !== undefined) updates.lifecycleStatus = bulkEdit.lifecycleStatus;
    if (bulkEdit.reorderThreshold !== undefined) updates.reorderThreshold = bulkEdit.reorderThreshold;

    if (Object.keys(updates).length === 0) {
      setError('No changes specified');
      return;
    }

    setError(null);
    setSuccess(false);

    try {
      await bulkUpdateItems({ itemIds: selectedItemIds, updates });
      setSuccess(true);
      setSelectedItemIds([]);
      setBulkEdit({});
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBulkAdjustment = async (adjustment: number) => {
    if (selectedItemIds.length === 0) {
      setError('No items selected');
      return;
    }

    setError(null);
    try {
      // Apply threshold adjustment to all selected items
      for (const itemId of selectedItemIds) {
        const item = items.find(i => i.id === itemId);
        if (item) {
          const newThreshold = Math.max(0, item.reorderThreshold + adjustment);
          await updateItem(itemId, { reorderThreshold: newThreshold });
        }
      }
      setSuccess(true);
      setSelectedItemIds([]);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Bulk Operations</h2>

      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-100 text-green-700 rounded-lg">
          Bulk operation completed successfully!
        </div>
      )}

      {/* Selection Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedItemIds.length === enrichedItems.length && enrichedItems.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="font-semibold">
              {selectedItemIds.length} of {enrichedItems.length} items selected
            </span>
          </div>
          
          {selectedItemIds.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Edit size={18} />
                Bulk Edit
              </button>
            </div>
          )}
        </div>

        {/* Bulk Edit Form */}
        {isEditing && (
          <div className="border-t pt-4 space-y-4">
            <h3 className="font-semibold text-gray-700">Edit Selected Items</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={bulkEdit.categoryId === undefined ? '' : bulkEdit.categoryId || 'null'}
                  onChange={(e) => setBulkEdit(prev => ({
                    ...prev,
                    categoryId: e.target.value === '' ? undefined : e.target.value === 'null' ? null : e.target.value
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">No change</option>
                  <option value="null">Uncategorized</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={bulkEdit.locationId === undefined ? '' : bulkEdit.locationId || 'null'}
                  onChange={(e) => setBulkEdit(prev => ({
                    ...prev,
                    locationId: e.target.value === '' ? undefined : e.target.value === 'null' ? null : e.target.value
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">No change</option>
                  <option value="null">Unassigned</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={bulkEdit.lifecycleStatus || ''}
                  onChange={(e) => setBulkEdit(prev => ({
                    ...prev,
                    lifecycleStatus: e.target.value as LifecycleStatus || undefined
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">No change</option>
                  <option value="active">Active</option>
                  <option value="reserved">Reserved</option>
                  <option value="damaged">Damaged</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                  <option value="disposed">Disposed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reorder Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={bulkEdit.reorderThreshold || ''}
                  onChange={(e) => setBulkEdit(prev => ({
                    ...prev,
                    reorderThreshold: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  placeholder="No change"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleBulkUpdate}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Apply Changes
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setBulkEdit({});
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-700 mb-2">Quick Adjustments</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkAdjustment(5)}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  +5 to Thresholds
                </button>
                <button
                  onClick={() => handleBulkAdjustment(-5)}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  -5 from Thresholds
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Item List with Checkboxes */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItemIds.length === enrichedItems.length && enrichedItems.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Value</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {enrichedItems.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">{item.sku}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-sm">{item.quantity}</td>
                  <td className="px-4 py-3 text-sm">${item.totalValue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.lifecycleStatus === 'active' ? 'bg-green-100 text-green-700' :
                      item.lifecycleStatus === 'reserved' ? 'bg-blue-100 text-blue-700' :
                      item.lifecycleStatus === 'damaged' ? 'bg-red-100 text-red-700' :
                      item.lifecycleStatus === 'expired' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {item.lifecycleStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
