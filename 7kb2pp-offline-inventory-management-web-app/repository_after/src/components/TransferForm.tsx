'use client';

import { useState } from 'react';
import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { X, ArrowRight, Package } from 'lucide-react';

interface TransferFormProps {
  itemId?: string;
  onClose: () => void;
}

export function TransferForm({ itemId: initialItemId, onClose }: TransferFormProps) {
  const { items, locations, recordTransfer } = useInventoryStore();
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  
  const [itemId, setItemId] = useState(initialItemId || '');
  const [toLocationId, setToLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const selectedItem = enrichedItems.find(i => i.id === itemId);
  const currentLocation = selectedItem?.locationId 
    ? locations.find(l => l.id === selectedItem.locationId)
    : null;
  
  // Filter out current location from destination options
  const availableDestinations = locations.filter(l => l.id !== selectedItem?.locationId);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!itemId) {
      setError('Please select an item to transfer');
      return;
    }
    
    if (!toLocationId && toLocationId !== '') {
      setError('Please select a destination location');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await recordTransfer(
        itemId, 
        toLocationId || null, 
        reason || undefined
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="text-purple-500" size={24} />
            Transfer Item
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item to Transfer *
            </label>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setToLocationId(''); // Reset destination when item changes
              }}
              className="w-full px-3 py-2 border rounded-lg"
              disabled={!!initialItemId}
            >
              <option value="">Select an item...</option>
              {enrichedItems
                .filter(item => item.quantity > 0)
                .map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} (SKU: {item.sku}) - Qty: {item.quantity}
                  </option>
                ))}
            </select>
          </div>
          
          {selectedItem && (
            <>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Current Location</p>
                    <p className="font-medium">
                      {currentLocation?.name || 'Unassigned'}
                    </p>
                  </div>
                  <ArrowRight className="text-gray-400" size={24} />
                  <div>
                    <p className="text-sm text-gray-500">Item Quantity</p>
                    <p className="font-medium">{selectedItem.quantity} units</p>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination Location *
                </label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select destination...</option>
                  <option value="unassigned">Unassigned (Remove from location)</option>
                  {availableDestinations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.capacity && ` (Capacity: ${loc.capacity})`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="e.g., Inventory reorganization, customer request..."
                />
              </div>
            </>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !itemId || (!toLocationId && toLocationId !== 'unassigned')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? 'Transferring...' : 'Transfer Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
