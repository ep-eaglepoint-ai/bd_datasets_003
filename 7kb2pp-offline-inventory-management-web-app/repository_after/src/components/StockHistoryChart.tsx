'use client';

import { useInventoryStore } from '@/lib/store';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { generateStockHistoryData } from '@/lib/calculations';
import { useMemo, useState } from 'react';

export function StockHistoryChart() {
  const items = useInventoryStore(state => state.items);
  const movements = useInventoryStore(state => state.movements);
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  const stockHistory = useMemo(() => {
    if (!selectedItemId) return [];
    return generateStockHistoryData(selectedItemId, movements, 30);
  }, [selectedItemId, movements]);

  const topItems = useMemo(() => {
    return items
      .filter(item => {
        const itemMovements = movements.filter(m => m.itemId === item.id);
        return itemMovements.length > 0;
      })
      .slice(0, 20);
  }, [items, movements]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Stock History (30 Days)</h3>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Item
        </label>
        <select
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select an item --</option>
          {topItems.map(item => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.sku})
            </option>
          ))}
        </select>
      </div>

      <div className="h-80">
        {selectedItemId && stockHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stockHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="stepAfter" 
                dataKey="quantity" 
                stroke="#0088FE" 
                strokeWidth={2} 
                name="Quantity"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            {selectedItemId ? 'No stock history available' : 'Please select an item to view its stock history'}
          </div>
        )}
      </div>
    </div>
  );
}
