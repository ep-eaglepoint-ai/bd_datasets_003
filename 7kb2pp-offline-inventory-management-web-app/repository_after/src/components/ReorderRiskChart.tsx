'use client';

import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useMemo } from 'react';

export function ReorderRiskChart() {
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  const movements = useInventoryStore(state => state.movements);

  const riskTrendData = useMemo(() => {
    const days = 30;
    const now = new Date();
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const movementsUpToDate = movements.filter(
        m => new Date(m.timestamp) <= date
      );

      let criticalCount = 0;
      let warningCount = 0;
      let healthyCount = 0;

      for (const item of enrichedItems) {
        const itemMovements = movementsUpToDate.filter(m => m.itemId === item.id);
        const quantity = itemMovements.length > 0
          ? itemMovements[itemMovements.length - 1].newQuantity
          : 0;

        if (quantity === 0) {
          criticalCount++;
        } else if (quantity <= item.reorderThreshold) {
          warningCount++;
        } else {
          healthyCount++;
        }
      }

      data.push({
        date: dateStr,
        critical: criticalCount,
        warning: warningCount,
        healthy: healthyCount,
      });
    }

    return data;
  }, [enrichedItems, movements]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Reorder Risk Trends (30 Days)</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={riskTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} name="Critical (Out of Stock)" />
            <Line type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} name="Warning (Low Stock)" />
            <Line type="monotone" dataKey="healthy" stroke="#10b981" strokeWidth={2} name="Healthy" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
