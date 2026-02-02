'use client';

import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useMemo } from 'react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c'];

export function WarehouseUtilizationChart() {
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  const locations = useInventoryStore(state => state.locations);

  const utilizationData = useMemo(() => {
    const locationStats: Record<string, { itemCount: number; totalQuantity: number; totalValue: number }> = {};

    for (const item of enrichedItems) {
      const locationId = item.locationId || 'unassigned';
      if (!locationStats[locationId]) {
        locationStats[locationId] = { itemCount: 0, totalQuantity: 0, totalValue: 0 };
      }
      locationStats[locationId].itemCount++;
      locationStats[locationId].totalQuantity += item.quantity;
      locationStats[locationId].totalValue += item.totalValue;
    }

    return Object.entries(locationStats).map(([locationId, stats]) => {
      const location = locations.find(l => l.id === locationId);
      return {
        name: location?.name || 'Unassigned',
        itemCount: stats.itemCount,
        quantity: stats.totalQuantity,
        value: stats.totalValue,
      };
    }).sort((a, b) => b.value - a.value);
  }, [enrichedItems, locations]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Warehouse Utilization by Location</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={utilizationData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
            <Tooltip 
              formatter={(value: number, name: string) => {
                if (name === 'value') return [`$${value.toLocaleString()}`, 'Total Value'];
                if (name === 'quantity') return [value.toLocaleString(), 'Total Quantity'];
                return [value, name];
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="quantity" fill="#8884d8" name="Total Quantity">
              {utilizationData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
            <Bar yAxisId="right" dataKey="value" fill="#82ca9d" name="Total Value ($)">
              {utilizationData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {utilizationData.map((loc, idx) => (
          <div key={idx} className="text-center p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-500 truncate">{loc.name}</p>
            <p className="text-sm font-semibold">{loc.itemCount} items</p>
            <p className="text-xs text-gray-600">${loc.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
