'use client';

import { useInventoryStore, selectEnrichedItems } from '@/lib/store';
import { useMemo } from 'react';
import { AlertTriangle, Clock, XCircle, CheckCircle } from 'lucide-react';

export function ExpirationRiskView() {
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  const movements = useInventoryStore(state => state.movements);

  const expirationData = useMemo(() => {
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const expired: typeof enrichedItems = [];
    const critical: typeof enrichedItems = []; // 7 days
    const warning: typeof enrichedItems = []; // 30 days
    const upcoming: typeof enrichedItems = []; // 90 days
    const noExpiration: typeof enrichedItems = [];

    for (const item of enrichedItems) {
      if (!item.expirationDate) {
        noExpiration.push(item);
        continue;
      }
      const expDate = new Date(item.expirationDate);
      if (expDate <= now) {
        expired.push(item);
      } else if (expDate <= sevenDays) {
        critical.push(item);
      } else if (expDate <= thirtyDays) {
        warning.push(item);
      } else if (expDate <= ninetyDays) {
        upcoming.push(item);
      }
    }

    return { expired, critical, warning, upcoming, noExpiration };
  }, [enrichedItems]);

  // Calculate shrinkage indicators
  const shrinkageData = useMemo(() => {
    const shrinkageMovements = movements.filter(m => 
      m.type === 'adjustment' && m.quantity < 0
    );
    
    const items = useInventoryStore.getState().items;
    const shrinkageValue = shrinkageMovements.reduce((sum, m) => {
      const item = items.find(i => i.id === m.itemId);
      return sum + (item ? Math.abs(m.quantity) * item.unitCost : 0);
    }, 0);

    const totalMovements = movements.length;
    const shrinkageRate = totalMovements > 0 
      ? (shrinkageMovements.length / totalMovements) * 100 
      : 0;

    return {
      events: shrinkageMovements.length,
      value: shrinkageValue,
      rate: shrinkageRate,
      recentEvents: shrinkageMovements
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5),
    };
  }, [movements]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const getDaysUntilExpiration = (dateStr: string) => {
    const now = new Date();
    const expDate = new Date(dateStr);
    const diffMs = expDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Expiration Risk & Shrinkage</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="text-red-600" size={20} />
            <span className="font-semibold text-red-800">Expired</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{expirationData.expired.length}</p>
          <p className="text-sm text-red-600">
            ${expirationData.expired.reduce((sum, i) => sum + i.totalValue, 0).toLocaleString()} at risk
          </p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-orange-600" size={20} />
            <span className="font-semibold text-orange-800">Critical (≤7 days)</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{expirationData.critical.length}</p>
          <p className="text-sm text-orange-600">
            ${expirationData.critical.reduce((sum, i) => sum + i.totalValue, 0).toLocaleString()} at risk
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-yellow-600" size={20} />
            <span className="font-semibold text-yellow-800">Warning (≤30 days)</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{expirationData.warning.length}</p>
          <p className="text-sm text-yellow-600">
            ${expirationData.warning.reduce((sum, i) => sum + i.totalValue, 0).toLocaleString()} at risk
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-green-600" size={20} />
            <span className="font-semibold text-green-800">Safe (>30 days)</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{expirationData.upcoming.length}</p>
          <p className="text-sm text-green-600">items with upcoming expiration</p>
        </div>
      </div>

      {/* Shrinkage Indicators */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Shrinkage Indicators</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Total Shrinkage Events</p>
            <p className="text-2xl font-bold text-gray-800">{shrinkageData.events}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Total Shrinkage Value</p>
            <p className="text-2xl font-bold text-red-600">${shrinkageData.value.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Shrinkage Rate</p>
            <p className="text-2xl font-bold text-gray-800">{shrinkageData.rate.toFixed(2)}%</p>
          </div>
        </div>
        {shrinkageData.recentEvents.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Shrinkage Events</h4>
            <div className="space-y-2">
              {shrinkageData.recentEvents.map(event => {
                const item = useInventoryStore.getState().items.find(i => i.id === event.itemId);
                return (
                  <div key={event.id} className="flex justify-between items-center p-2 bg-red-50 rounded text-sm">
                    <span>{item?.name || 'Unknown Item'}</span>
                    <span className="text-red-600">{event.quantity} units</span>
                    <span className="text-gray-500">{new Date(event.timestamp).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Expired Items List */}
      {expirationData.expired.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-600">Expired Items (Requires Action)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-left">Expired On</th>
                </tr>
              </thead>
              <tbody>
                {expirationData.expired.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-gray-600">{item.sku}</td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">${item.totalValue.toLocaleString()}</td>
                    <td className="px-4 py-2 text-red-600">{formatDate(item.expirationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Critical Items List */}
      {expirationData.critical.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-orange-600">Critical - Expiring Within 7 Days</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-50">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-left">Expires In</th>
                </tr>
              </thead>
              <tbody>
                {expirationData.critical.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-gray-600">{item.sku}</td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">${item.totalValue.toLocaleString()}</td>
                    <td className="px-4 py-2 text-orange-600">
                      {getDaysUntilExpiration(item.expirationDate!)} days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warning Items List */}
      {expirationData.warning.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-yellow-600">Warning - Expiring Within 30 Days</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-yellow-50">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-left">Expires In</th>
                </tr>
              </thead>
              <tbody>
                {expirationData.warning.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-gray-600">{item.sku}</td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">${item.totalValue.toLocaleString()}</td>
                    <td className="px-4 py-2 text-yellow-600">
                      {getDaysUntilExpiration(item.expirationDate!)} days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
