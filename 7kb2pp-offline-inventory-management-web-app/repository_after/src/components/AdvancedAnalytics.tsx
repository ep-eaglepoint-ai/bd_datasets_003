'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useInventoryStore } from '@/lib/store';
import { enrichItemsWithQuantities, calculateInventoryHealth } from '@/lib/calculations';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Activity, Package, DollarSign, Clock } from 'lucide-react';

// Dynamically import ECharts to avoid SSR issues
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface VelocityData {
  itemId: string;
  name: string;
  sku: string;
  dailyVelocity: number;
  weeklyVelocity: number;
  daysOfStock: number;
  status: 'healthy' | 'warning' | 'critical';
}

export default function AdvancedAnalytics() {
  const { items, movements, categories, locations } = useInventoryStore();
  const [selectedPeriod, setSelectedPeriod] = useState<30 | 60 | 90>(30);
  const [velocityData, setVelocityData] = useState<VelocityData[]>([]);
  
  // Calculate enriched items and health metrics
  const enrichedItems = useMemo(() => 
    enrichItemsWithQuantities(items, movements),
    [items, movements]
  );
  
  const healthMetrics = useMemo(() => 
    calculateInventoryHealth(enrichedItems, movements),
    [enrichedItems, movements]
  );
  
  // Calculate velocity data for each item
  useEffect(() => {
    const now = Date.now();
    const periodStart = now - (selectedPeriod * 24 * 60 * 60 * 1000);
    
    const velocities: VelocityData[] = enrichedItems.map(item => {
      const itemMovements = movements.filter(
        m => m.itemId === item.id && new Date(m.timestamp).getTime() > periodStart
      );
      
      const outboundMovements = itemMovements.filter(m => m.type === 'outbound');
      const totalOutbound = Math.abs(outboundMovements.reduce((sum, m) => sum + m.quantity, 0));
      
      const dailyVelocity = totalOutbound / selectedPeriod;
      const weeklyVelocity = dailyVelocity * 7;
      const daysOfStock = dailyVelocity > 0 ? item.quantity / dailyVelocity : Infinity;
      
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (daysOfStock < 7) status = 'critical';
      else if (daysOfStock < 14) status = 'warning';
      
      return {
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        dailyVelocity,
        weeklyVelocity,
        daysOfStock: daysOfStock === Infinity ? 999 : Math.round(daysOfStock),
        status,
      };
    });
    
    setVelocityData(velocities.sort((a, b) => a.daysOfStock - b.daysOfStock));
  }, [enrichedItems, movements, selectedPeriod]);
  
  // ECharts: Stock Velocity Scatter Plot
  const velocityChartOption = useMemo(() => ({
    title: {
      text: 'Stock Velocity Analysis',
      left: 'center',
      textStyle: { color: '#374151' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: { data: number[]; name: string }) => {
        const item = velocityData.find(v => v.name === params.name);
        if (!item) return '';
        return `
          <strong>${item.name}</strong><br/>
          SKU: ${item.sku}<br/>
          Daily Velocity: ${item.dailyVelocity.toFixed(2)}<br/>
          Days of Stock: ${item.daysOfStock === 999 ? '∞' : item.daysOfStock}
        `;
      },
    },
    xAxis: {
      name: 'Daily Velocity',
      nameLocation: 'center',
      nameGap: 30,
      type: 'value',
    },
    yAxis: {
      name: 'Days of Stock',
      nameLocation: 'center',
      nameGap: 40,
      type: 'value',
      max: 100,
    },
    series: [{
      type: 'scatter',
      symbolSize: 15,
      data: velocityData.map(v => ({
        value: [v.dailyVelocity, Math.min(v.daysOfStock, 100)],
        name: v.name,
        itemStyle: {
          color: v.status === 'critical' ? '#ef4444' 
            : v.status === 'warning' ? '#f59e0b' 
            : '#22c55e',
        },
      })),
    }],
  }), [velocityData]);
  
  // ECharts: Movement Trends Line Chart
  const trendChartOption = useMemo(() => {
    const now = Date.now();
    const dailyData: Record<string, { inbound: number; outbound: number }> = {};
    
    for (let i = selectedPeriod - 1; i >= 0; i--) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { inbound: 0, outbound: 0 };
    }
    
    const periodStart = now - (selectedPeriod * 24 * 60 * 60 * 1000);
    movements
      .filter(m => new Date(m.timestamp).getTime() > periodStart)
      .forEach(m => {
        const dateKey = m.timestamp.split('T')[0];
        if (dailyData[dateKey]) {
          if (m.type === 'inbound') {
            dailyData[dateKey].inbound += m.quantity;
          } else if (m.type === 'outbound') {
            dailyData[dateKey].outbound += Math.abs(m.quantity);
          }
        }
      });
    
    const dates = Object.keys(dailyData).sort();
    const inboundData = dates.map(d => dailyData[d].inbound);
    const outboundData = dates.map(d => dailyData[d].outbound);
    
    return {
      title: {
        text: 'Movement Trends',
        left: 'center',
        textStyle: { color: '#374151' },
      },
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['Inbound', 'Outbound'],
        bottom: 0,
      },
      xAxis: {
        type: 'category',
        data: dates.map(d => d.substring(5)), // MM-DD format
        axisLabel: { rotate: 45 },
      },
      yAxis: {
        type: 'value',
        name: 'Quantity',
      },
      series: [
        {
          name: 'Inbound',
          type: 'line',
          smooth: true,
          data: inboundData,
          lineStyle: { color: '#22c55e' },
          itemStyle: { color: '#22c55e' },
          areaStyle: { color: 'rgba(34, 197, 94, 0.1)' },
        },
        {
          name: 'Outbound',
          type: 'line',
          smooth: true,
          data: outboundData,
          lineStyle: { color: '#ef4444' },
          itemStyle: { color: '#ef4444' },
          areaStyle: { color: 'rgba(239, 68, 68, 0.1)' },
        },
      ],
    };
  }, [movements, selectedPeriod]);
  
  // ECharts: Category Distribution Pie Chart
  const categoryChartOption = useMemo(() => {
    const categoryValues: Record<string, number> = {};
    
    enrichedItems.forEach(item => {
      const category = categories.find(c => c.id === item.categoryId);
      const categoryName = category?.name || 'Uncategorized';
      categoryValues[categoryName] = (categoryValues[categoryName] || 0) + item.totalValue;
    });
    
    return {
      title: {
        text: 'Value by Category',
        left: 'center',
        textStyle: { color: '#374151' },
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: ${c} ({d}%)',
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: '{b}: {d}%',
        },
        data: Object.entries(categoryValues).map(([name, value]) => ({
          name,
          value: Math.round(value * 100) / 100,
        })),
      }],
    };
  }, [enrichedItems, categories]);
  
  // Health Score Gauge
  const healthGaugeOption = useMemo(() => ({
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 100,
      splitNumber: 10,
      axisLine: {
        lineStyle: {
          width: 20,
          color: [
            [0.3, '#ef4444'],
            [0.7, '#f59e0b'],
            [1, '#22c55e'],
          ],
        },
      },
      pointer: {
        itemStyle: { color: '#374151' },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: {
        offsetCenter: [0, '30%'],
        fontSize: 14,
        color: '#6b7280',
      },
      detail: {
        fontSize: 30,
        offsetCenter: [0, '-10%'],
        formatter: '{value}',
        color: '#374151',
      },
      data: [{ value: Math.round(healthMetrics.overallHealthScore), name: 'Health Score' }],
    }],
  }), [healthMetrics.overallHealthScore]);
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning': return <TrendingDown className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">Advanced Analytics</h2>
        <div className="flex gap-2">
          {([30, 60, 90] as const).map(period => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {period} Days
            </button>
          ))}
        </div>
      </div>
      
      {/* Health Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Items</p>
              <p className="text-xl font-bold text-gray-800">{healthMetrics.totalItems}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Value</p>
              <p className="text-xl font-bold text-gray-800">
                ${healthMetrics.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Low Stock Items</p>
              <p className="text-xl font-bold text-gray-800">{healthMetrics.lowStockCount}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Turnover Rate</p>
              <p className="text-xl font-bold text-gray-800">
                {healthMetrics.turnoverRate.toFixed(2)}x
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <ReactECharts option={healthGaugeOption} style={{ height: 250 }} />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Dead Stock Ratio:</span>
              <span className="font-medium">{(healthMetrics.deadStockRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Demand Consistency:</span>
              <span className="font-medium">{(healthMetrics.demandConsistency * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Replenishment Eff:</span>
              <span className="font-medium">{(healthMetrics.replenishmentEfficiency * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Stock Age:</span>
              <span className="font-medium">{Math.round(healthMetrics.stockAgingDays)} days</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <ReactECharts option={categoryChartOption} style={{ height: 300 }} />
        </div>
      </div>
      
      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <ReactECharts option={trendChartOption} style={{ height: 300 }} />
        </div>
        
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <ReactECharts option={velocityChartOption} style={{ height: 300 }} />
        </div>
      </div>
      
      {/* Velocity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Stock Velocity Report
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Daily Velocity</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weekly Velocity</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days of Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {velocityData.slice(0, 10).map(item => (
                <tr key={item.itemId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{getStatusIcon(item.status)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.sku}</td>
                  <td className="px-4 py-3 text-right">{item.dailyVelocity.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{item.weeklyVelocity.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${
                      item.status === 'critical' ? 'text-red-600' 
                        : item.status === 'warning' ? 'text-yellow-600' 
                        : 'text-green-600'
                    }`}>
                      {item.daysOfStock === 999 ? '∞' : item.daysOfStock}
                    </span>
                  </td>
                </tr>
              ))}
              {velocityData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No items to analyze. Add inventory items to see velocity data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
