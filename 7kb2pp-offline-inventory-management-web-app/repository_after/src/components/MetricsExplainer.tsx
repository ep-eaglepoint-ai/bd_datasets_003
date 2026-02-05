'use client';

import { useState } from 'react';
import { useInventoryStore, selectEnrichedItems, selectInventoryHealth } from '@/lib/store';
import { Info, HelpCircle, TrendingUp, Package, AlertTriangle } from 'lucide-react';

export function MetricsExplainer() {
  const health = useInventoryStore(selectInventoryHealth);
  const enrichedItems = useInventoryStore(selectEnrichedItems);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const toggleMetric = (metric: string) => {
    setExpandedMetric(expandedMetric === metric ? null : metric);
  };

  const metrics = [
    {
      id: 'totalValue',
      name: 'Total Inventory Value',
      value: `$${health.totalValue.toFixed(2)}`,
      icon: Package,
      color: 'blue',
      explanation: {
        formula: 'Sum of (Quantity × Unit Cost) for all items',
        calculation: 'For each item, multiply its current quantity by its unit cost, then sum all values.',
        example: 'Item A: 100 units × $10 = $1,000\nItem B: 50 units × $20 = $1,000\nTotal Value = $2,000',
        interpretation: 'This represents the total capital invested in your inventory at cost price.',
      },
    },
    {
      id: 'turnoverRate',
      name: 'Inventory Turnover Rate',
      value: health.turnoverRate.toFixed(2),
      icon: TrendingUp,
      color: 'green',
      explanation: {
        formula: 'Sum of outbound movements / Average inventory quantity',
        calculation: 'We sum all outbound movement quantities over a period (default 30 days) and divide by the average inventory level during that period.',
        example: 'Total outbound: 300 units\nAverage inventory: 150 units\nTurnover Rate = 300 / 150 = 2.0',
        interpretation: 'Higher values indicate faster-moving inventory. A rate of 2.0 means you sell through your average inventory twice in the period. Optimal varies by industry.',
      },
    },
    {
      id: 'stockAgingDays',
      name: 'Average Stock Aging',
      value: `${health.stockAgingDays} days`,
      icon: AlertTriangle,
      color: 'orange',
      explanation: {
        formula: 'Weighted average of days since inbound movements',
        calculation: 'For each item, we calculate the average age of units in stock based on inbound movement dates, weighted by quantity.',
        example: '50 units received 10 days ago\n50 units received 30 days ago\nWeighted Average = (50×10 + 50×30) / 100 = 20 days',
        interpretation: 'Lower values indicate fresher stock. High aging may indicate slow-moving items or overstocking.',
      },
    },
    {
      id: 'deadStockRatio',
      name: 'Dead Stock Ratio',
      value: `${(health.deadStockRatio * 100).toFixed(1)}%`,
      icon: Package,
      color: 'red',
      explanation: {
        formula: '(Items with no movements in period) / (Total items with stock)',
        calculation: 'We count items that have stock but haven\'t had any movements in the past 90 days (configurable), then divide by total items with stock.',
        example: '10 items have no movements in 90 days\n100 total items with stock\nDead Stock Ratio = 10 / 100 = 0.10 (10%)',
        interpretation: 'Lower is better. High ratios indicate capital tied up in non-moving inventory. Target: <5%',
      },
    },
    {
      id: 'replenishmentEfficiency',
      name: 'Replenishment Efficiency',
      value: `${(health.replenishmentEfficiency * 100).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'blue',
      explanation: {
        formula: '(Successful replenishments) / (Total low-stock occurrences)',
        calculation: 'We track when items fall below reorder threshold (low-stock) and count how many times they were successfully restocked above threshold.',
        example: 'Item went low-stock 10 times\nSuccessfully replenished 8 times\nEfficiency = 8 / 10 = 0.80 (80%)',
        interpretation: '100% means every time stock ran low, it was replenished. Lower values indicate missed restocking opportunities.',
      },
    },
    {
      id: 'demandConsistency',
      name: 'Demand Consistency',
      value: `${(health.demandConsistency * 100).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'green',
      explanation: {
        formula: '1 - (Standard Deviation / Mean) of outbound quantities',
        calculation: 'We calculate the coefficient of variation for outbound movements. Lower variation = higher consistency.',
        example: 'Outbound movements: 10, 12, 11, 9, 10 units\nMean = 10.4, StdDev = 1.14\nCoV = 1.14/10.4 = 0.11\nConsistency = 1 - 0.11 = 0.89 (89%)',
        interpretation: '100% means perfectly predictable demand. Lower values indicate erratic demand patterns requiring higher safety stock.',
      },
    },
    {
      id: 'overallHealthScore',
      name: 'Overall Health Score',
      value: `${health.overallHealthScore}/100`,
      icon: Info,
      color: 'purple',
      explanation: {
        formula: 'Weighted average of all metrics',
        calculation: `
Components (each 25% weight):
• Dead Stock (inverse): ${((1 - health.deadStockRatio) * 25).toFixed(1)} points
• Replenishment Efficiency: ${(health.replenishmentEfficiency * 25).toFixed(1)} points
• Demand Consistency: ${(health.demandConsistency * 25).toFixed(1)} points
• Turnover Health: ${(Math.min(1, health.turnoverRate / 2) * 25).toFixed(1)} points`,
        example: 'Each component contributes 0-25 points, total 0-100',
        interpretation: '>80 = Excellent, 60-80 = Good, 40-60 = Fair, <40 = Needs Attention',
      },
    },
    {
      id: 'lowStockCount',
      name: 'Low Stock Items',
      value: health.lowStockCount.toString(),
      icon: AlertTriangle,
      color: 'yellow',
      explanation: {
        formula: 'Count of items where Quantity ≤ Reorder Threshold',
        calculation: 'For each item, compare current quantity to its reorder threshold.',
        example: 'Item A: 5 units, threshold 10 → Low Stock\nItem B: 20 units, threshold 10 → OK',
        interpretation: 'Items flagged for reordering. Set appropriate thresholds based on lead time and demand variability.',
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="text-blue-600" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">Metrics Explained</h2>
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-blue-800">
          <strong>How Metrics Are Calculated:</strong> All metrics are computed in real-time from your movement history. 
          This ensures accuracy and provides full transparency into your inventory health.
        </p>
      </div>

      <div className="grid gap-4">
        {metrics.map(metric => {
          const Icon = metric.icon;
          const isExpanded = expandedMetric === metric.id;
          
          return (
            <div key={metric.id} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() => toggleMetric(metric.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${metric.color}-100`}>
                    <Icon className={`text-${metric.color}-600`} size={24} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-800">{metric.name}</h3>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                  </div>
                </div>
                <Info className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} size={20} />
              </button>

              {isExpanded && (
                <div className="px-6 pb-6 space-y-4 border-t bg-gray-50">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2 mt-4">Formula</h4>
                    <code className="block bg-white px-3 py-2 rounded border text-sm text-gray-800">
                      {metric.explanation.formula}
                    </code>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">How It's Calculated</h4>
                    <p className="text-gray-600 text-sm whitespace-pre-line">
                      {metric.explanation.calculation}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Example</h4>
                    <pre className="bg-white px-3 py-2 rounded border text-sm text-gray-800 overflow-x-auto">
                      {metric.explanation.example}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Interpretation</h4>
                    <p className="text-gray-600 text-sm">
                      {metric.explanation.interpretation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Understanding Your Inventory</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            <strong>All quantities are derived from movement history:</strong> We never store quantity directly. 
            Instead, we track every stock movement (inbound, outbound, adjustments) and calculate current quantities 
            from this immutable audit trail.
          </p>
          <p>
            <strong>Why this matters:</strong> This approach ensures data integrity and provides complete traceability. 
            You can always see exactly how you arrived at any quantity or value.
          </p>
          <p>
            <strong>Performance note:</strong> Calculations are optimized to run efficiently even with thousands of items 
            and movements. We use memoization and selective recalculation to keep the interface responsive.
          </p>
        </div>
      </div>
    </div>
  );
}
