'use client';

import { useInventoryStore, selectEnrichedItems, selectTotalValue, selectInventoryHealth, selectLowStockItems, selectValueByCategory } from '@/lib/store';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { generateValuationHistoryData, identifySlowMovingItems, identifyOverstockItems } from '@/lib/calculations';
import { AlertTriangle, TrendingUp, Package, DollarSign, Activity, AlertCircle } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function Dashboard() {
  const { items, movements, categories } = useInventoryStore();
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  const totalValue = useInventoryStore(selectTotalValue);
  const health = useInventoryStore(selectInventoryHealth);
  const lowStockItems = useInventoryStore(selectLowStockItems);
  const valueByCategory = useInventoryStore(selectValueByCategory);
  
  const valuationHistory = generateValuationHistoryData(items, movements, 30);
  const slowMovingItems = identifySlowMovingItems(items, movements);
  const overstockItems = identifyOverstockItems(items, movements);
  
  // Prepare category data for pie chart
  const categoryData = Object.entries(valueByCategory).map(([categoryId, value]) => {
    const category = categories.find(c => c.id === categoryId);
    return {
      name: category?.name || 'Uncategorized',
      value: value,
    };
  }).filter(d => d.value > 0);
  
  // Stock status distribution
  const activeItems = enrichedItems.filter(i => i.lifecycleStatus === 'active').length;
  const reservedItems = enrichedItems.filter(i => i.lifecycleStatus === 'reserved').length;
  const damagedItems = enrichedItems.filter(i => i.lifecycleStatus === 'damaged').length;
  const expiredItems = enrichedItems.filter(i => i.lifecycleStatus === 'expired').length;
  
  const statusData = [
    { name: 'Active', value: activeItems },
    { name: 'Reserved', value: reservedItems },
    { name: 'Damaged', value: damagedItems },
    { name: 'Expired', value: expiredItems },
  ].filter(d => d.value > 0);
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Items</p>
              <p className="text-2xl font-bold text-gray-800">{items.length}</p>
            </div>
            <Package className="text-blue-500" size={32} />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Value</p>
              <p className="text-2xl font-bold text-gray-800">${totalValue.toLocaleString()}</p>
            </div>
            <DollarSign className="text-green-500" size={32} />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Health Score</p>
              <p className="text-2xl font-bold text-gray-800">{health.overallHealthScore}/100</p>
            </div>
            <Activity className={`${health.overallHealthScore >= 70 ? 'text-green-500' : health.overallHealthScore >= 40 ? 'text-yellow-500' : 'text-red-500'}`} size={32} />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Low Stock Alerts</p>
              <p className="text-2xl font-bold text-gray-800">{lowStockItems.length}</p>
            </div>
            <AlertTriangle className={lowStockItems.length > 0 ? 'text-red-500' : 'text-gray-400'} size={32} />
          </div>
        </div>
      </div>
      
      {/* Health Metrics Detail */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Inventory Health Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-500">Dead Stock Ratio</p>
            <p className="text-xl font-bold">{(health.deadStockRatio * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Lower is better</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Replenishment Efficiency</p>
            <p className="text-xl font-bold">{(health.replenishmentEfficiency * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Higher is better</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Stock Aging</p>
            <p className="text-xl font-bold">{health.stockAgingDays} days</p>
            <p className="text-xs text-gray-400">Average age</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Demand Consistency</p>
            <p className="text-xl font-bold">{(health.demandConsistency * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Higher is better</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Turnover Rate</p>
            <p className="text-xl font-bold">{health.turnoverRate.toFixed(2)}</p>
            <p className="text-xs text-gray-400">Per 30 days</p>
          </div>
        </div>
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Valuation History */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Valuation Trend (30 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={valuationHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']} />
                <Line type="monotone" dataKey="totalValue" stroke="#0088FE" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Category Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Value by Category</h3>
          <div className="h-64">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                No category data available
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Status Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Lifecycle Status Distribution</h3>
        <div className="h-64">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              No items to display
            </div>
          )}
        </div>
      </div>
      
      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} />
            Low Stock Items
          </h3>
          {lowStockItems.length > 0 ? (
            <ul className="space-y-2 max-h-48 overflow-auto">
              {lowStockItems.slice(0, 10).map(item => (
                <li key={item.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-red-600">{item.quantity} / {item.reorderThreshold}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No low stock items</p>
          )}
        </div>
        
        {/* Slow Moving Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="text-yellow-500" size={20} />
            Slow Moving Items
          </h3>
          {slowMovingItems.length > 0 ? (
            <ul className="space-y-2 max-h-48 overflow-auto">
              {slowMovingItems.slice(0, 10).map(item => (
                <li key={item.id} className="flex justify-between items-center p-2 bg-yellow-50 rounded">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-yellow-600">{item.quantity} units</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No slow moving items</p>
          )}
        </div>
        
        {/* Overstock Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="text-orange-500" size={20} />
            Overstock Items
          </h3>
          {overstockItems.length > 0 ? (
            <ul className="space-y-2 max-h-48 overflow-auto">
              {overstockItems.slice(0, 10).map(item => (
                <li key={item.id} className="flex justify-between items-center p-2 bg-orange-50 rounded">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-orange-600">{item.quantity} units</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No overstock items</p>
          )}
        </div>
      </div>
    </div>
  );
}
