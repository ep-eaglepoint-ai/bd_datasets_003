'use client';

import { useState, useEffect } from 'react';
import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { X, RefreshCw } from 'lucide-react';

interface CorrectionFormProps {
  itemId?: string;
  onClose: () => void;
}

export function CorrectionForm({ itemId: initialItemId, onClose }: CorrectionFormProps) {
  const { recordCorrection } = useInventoryStore();
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  
  const [itemId, setItemId] = useState(initialItemId || '');
  const [newQuantity, setNewQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const selectedItem = enrichedItems.find(i => i.id === itemId);
  
  // Update newQuantity field when item changes to show current quantity
  useEffect(() => {
    if (selectedItem) {
      setNewQuantity(selectedItem.quantity.toString());
    } else {
      setNewQuantity('');
    }
  }, [selectedItem]);
  
  const quantityDiff = selectedItem 
    ? (parseInt(newQuantity) || 0) - selectedItem.quantity
    : 0;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!itemId) {
      setError('Please select an item');
      return;
    }
    
    if (!reason.trim()) {
      setError('Please provide a reason for this correction');
      return;
    }
    
    const qty = parseInt(newQuantity);
    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid non-negative quantity');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await recordCorrection(itemId, qty, reason.trim());
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
            <RefreshCw className="text-yellow-500" size={24} />
            Quantity Correction
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>
          )}
          
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
            <strong>Note:</strong> Corrections are for inventory count adjustments 
            (e.g., physical count discrepancies, damage, shrinkage). This creates an 
            immutable audit record with the required reason.
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item *
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              disabled={!!initialItemId}
            >
              <option value="">Select an item...</option>
              {enrichedItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} (SKU: {item.sku}) - Current Qty: {item.quantity}
                </option>
              ))}
            </select>
          </div>
          
          {selectedItem && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-500">Current Quantity</p>
                  <p className="text-2xl font-bold">{selectedItem.quantity}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Quantity *
                  </label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2 border rounded-lg text-lg"
                    placeholder="Enter corrected quantity"
                  />
                </div>
              </div>
              
              {quantityDiff !== 0 && (
                <div className={`p-3 rounded-lg ${quantityDiff > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <p className="font-medium">
                    Adjustment: {quantityDiff > 0 ? '+' : ''}{quantityDiff} units
                  </p>
                  <p className="text-sm">
                    {quantityDiff > 0 
                      ? 'This will increase the inventory count.'
                      : 'This will decrease the inventory count.'}
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason * <span className="text-gray-400">(required for audit)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  placeholder="e.g., Physical count discrepancy, damaged goods write-off, data entry error fix..."
                  required
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
              disabled={isSubmitting || !itemId || !reason.trim() || quantityDiff === 0}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? 'Recording...' : 'Record Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
