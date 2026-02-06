'use client';

import { useState } from 'react';
import { useInventoryStore } from '@/lib/store';
import { Plus, Edit, Trash2, X } from 'lucide-react';

export function LocationManager() {
  const { locations, addLocation, updateLocation, deleteLocation } = useInventoryStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', zone: '', capacity: '' });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    const locationData = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      zone: formData.zone.trim() || undefined,
      capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
    };
    
    if (editingId) {
      await updateLocation(editingId, locationData);
    } else {
      await addLocation(locationData);
    }
    
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '', zone: '', capacity: '' });
  };
  
  const handleEdit = (id: string) => {
    const location = locations.find(l => l.id === id);
    if (location) {
      setFormData({
        name: location.name,
        description: location.description || '',
        zone: location.zone || '',
        capacity: location.capacity?.toString() || '',
      });
      setEditingId(id);
      setShowForm(true);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this location?')) {
      await deleteLocation(id);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Locations</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: '', description: '', zone: '', capacity: '' }); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} /> Add Location
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow">
        {locations.length > 0 ? (
          <ul className="divide-y">
            {locations.map(location => (
              <li key={location.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p className="font-medium">{location.name}</p>
                  <div className="text-sm text-gray-500 flex gap-4">
                    {location.zone && <span>Zone: {location.zone}</span>}
                    {location.capacity && <span>Capacity: {location.capacity}</span>}
                    {location.description && <span>{location.description}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(location.id)} className="p-2 hover:bg-blue-100 rounded text-blue-600">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDelete(location.id)} className="p-2 hover:bg-red-100 rounded text-red-600">
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center text-gray-500">No locations yet. Add one to get started.</p>
        )}
      </div>
      
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{editingId ? 'Edit Location' : 'Add Location'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Location name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
                <input
                  type="text"
                  value={formData.zone}
                  onChange={e => setFormData(prev => ({ ...prev, zone: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Warehouse A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={e => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Max items"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
