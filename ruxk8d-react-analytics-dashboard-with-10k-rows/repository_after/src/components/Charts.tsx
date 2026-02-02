
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore } from '../store/dashboardStore';
import { useStats } from '../hooks/useTableData';
import { formatCurrency } from '../utils/formatters';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function Charts() {
  // Requirement 7: Subscribe only to stats/filtered data
  // We use the useStats custom hook which derives stats from transactions/filters
  const { stats, filteredTransactions } = useStats();

  const statusData = useMemo(() => Object.entries(stats.statusBreakdown).map(([name, value]) => ({
    name,
    value,
  })), [stats.statusBreakdown]);

  const categoryData = useMemo(() => Object.entries(stats.categoryBreakdown)
    .map(([name, value]) => ({ name, amount: value }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10), [stats.categoryBreakdown]);

  const monthlyChartData = useMemo(() => {
    const monthlyData = filteredTransactions.reduce((acc, t) => {
      const month = new Date(t.date).toLocaleString('default', { month: 'short', year: '2-digit' });
      acc[month] = (acc[month] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(monthlyData).map(([month, amount]) => ({
      month,
      amount,
    }));
  }, [filteredTransactions]);

  return (
    <div className="charts-container">
      <div className="chart-card">
        <h3>Transaction Status</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={statusData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Top Categories by Amount</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={categoryData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="amount" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Monthly Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="amount" fill="#82ca9d" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-summary">
        <div className="stat-card">
          <h4>Total Amount</h4>
          <p>{formatCurrency(stats.totalAmount)}</p>
        </div>
        <div className="stat-card">
          <h4>Transaction Count</h4>
          <p>{stats.transactionCount}</p>
        </div>
        <div className="stat-card">
          <h4>Average Amount</h4>
          <p>{formatCurrency(stats.averageAmount)}</p>
        </div>
      </div>
    </div>
  );
}
