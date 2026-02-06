'use client';

import { useState, useEffect } from 'react';
import { useInventoryStore } from '@/lib/store';
import { LifecycleStatus } from '@/lib/schemas';
import { X } from 'lucide-react';
import { z } from 'zod';

// Zod schema for form validation
const ItemFormSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200, 'Name too long'),
  sku: z.string().min(1, 'SKU is required').max(100, 'SKU too long'),
  categoryId: z.string().nullable(),
  locationId: z.string().nullable(),
  unitCost: z.number().nonnegative('Unit cost must be non-negative'),
  reorderThreshold: z.number().int('Must be a whole number').nonnegative('Threshold must be non-negative'),
  supplierNotes: z.string().max(1000, 'Notes too long').optional(),
  lifecycleStatus: z.enum(['active', 'reserved', 'damaged', 'expired', 'archived', 'disposed']),
  expirationDate: z.string().nullable(),
});

interface ItemFormProps {
  itemId: string | null;
  onClose: () => void;
}

export function ItemForm({ itemId, onClose }: ItemFormProps) {
  const { items, categories, locations, addItem, updateItem } = useInventoryStore();
  
  const existingItem = itemId ? items.find(i => i.id === itemId) : null;
  
  const [formData, setFormData] = useState({
    name: existingItem?.name || '',
    sku: existingItem?.sku || '',
    categoryId: existingItem?.categoryId || '',
    locationId: existingItem?.locationId || '',
    unitCost: existingItem?.unitCost?.toString() || '0',
    reorderThreshold: existingItem?.reorderThreshold?.toString() || '10',
    supplierNotes: existingItem?.supplierNotes || '',
    lifecycleStatus: existingItem?.lifecycleStatus || 'active',
    expirationDate: existingItem?.expirationDate?.split('T')[0] || '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Build data object for Zod validation
    const dataToValidate = {
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      categoryId: formData.categoryId || null,
      locationId: formData.locationId || null,
      unitCost: parseFloat(formData.unitCost) || 0,
      reorderThreshold: parseInt(formData.reorderThreshold) || 0,
      supplierNotes: formData.supplierNotes.trim() || undefined,
      lifecycleStatus: formData.lifecycleStatus as LifecycleStatus,
      expirationDate: formData.expirationDate ? new Date(formData.expirationDate).toISOString() : null,
    };
    
    // Use Zod for validation
    const result = ItemFormSchema.safeParse(dataToValidate);
    
    if (!result.success) {
      result.error.errors.forEach(err => {
        const field = err.path[0] as string;
        newErrors[field] = err.message;
      });
    }
    
    // Check for duplicate SKU (explicit check with user-facing error)
    const skuToCheck = formData.sku.trim().toLowerCase();
    const duplicateSku = items.find(
      item => item.sku.toLowerCase() === skuToCheck && item.id !== itemId
    );
    if (duplicateSku) {
      newErrors.sku = `SKU "${formData.sku.trim()}" already exists. Each item must have a unique SKU.`;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      const itemData = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        categoryId: formData.categoryId || null,
        locationId: formData.locationId || null,
        unitCost: parseFloat(formData.unitCost),
        reorderThreshold: parseInt(formData.reorderThreshold),
        supplierNotes: formData.supplierNotes.trim() || undefined,
        lifecycleStatus: formData.lifecycleStatus as LifecycleStatus,
        expirationDate: formData.expirationDate ? new Date(formData.expirationDate).toISOString() : null,
      };
      
      if (itemId) {
        await updateItem(itemId, itemData);
      } else {
        await addItem(itemData);
      }
      
      onClose();
    } catch (error) {
      setErrors({ submit: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">{itemId ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.submit && (
            <div className="p-3 bg-red-100 text-red-700 rounded">{errors.submit}</div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg ${errors.name ? 'border-red-500' : ''}`}
                placeholder="Item name"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg ${errors.sku ? 'border-red-500' : ''}`}
                placeholder="SKU or identifier"
              />
              {errors.sku && <p className="text-red-500 text-sm mt-1">{errors.sku}</p>}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                name="locationId"
                value={formData.locationId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($) *</label>
              <input
                type="number"
                name="unitCost"
                value={formData.unitCost}
                onChange={handleChange}
                step="0.01"
                min="0"
                className={`w-full px-3 py-2 border rounded-lg ${errors.unitCost ? 'border-red-500' : ''}`}
              />
              {errors.unitCost && <p className="text-red-500 text-sm mt-1">{errors.unitCost}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Threshold</label>
              <input
                type="number"
                name="reorderThreshold"
                value={formData.reorderThreshold}
                onChange={handleChange}
                min="0"
                className={`w-full px-3 py-2 border rounded-lg ${errors.reorderThreshold ? 'border-red-500' : ''}`}
              />
              {errors.reorderThreshold && <p className="text-red-500 text-sm mt-1">{errors.reorderThreshold}</p>}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                name="lifecycleStatus"
                value={formData.lifecycleStatus}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="active">Active</option>
                <option value="reserved">Reserved</option>
                <option value="damaged">Damaged</option>
                <option value="expired">Expired</option>
                <option value="archived">Archived</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
              <input
                type="date"
                name="expirationDate"
                value={formData.expirationDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Notes</label>
            <textarea
              name="supplierNotes"
              value={formData.supplierNotes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Optional notes about the supplier or item"
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : (itemId ? 'Update Item' : 'Add Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
