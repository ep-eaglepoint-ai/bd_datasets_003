<?php

namespace App\Services\Reports;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Support\Collection;

class CustomerReportService
{
    public function getCustomerLifetimeValue(): array
    {
        $customers = Customer::all();
        
        $report = [];
        
        foreach ($customers as $customer) {
            $orders = Order::where('customer_id', $customer->id)
                ->where('status', 'completed')
                ->get();
            
            $totalSpent = 0;
            $orderCount = 0;
            
            foreach ($orders as $order) {
                $totalSpent += $order->total;
                $orderCount++;
            }
            
            $report[] = [
                'customer_id' => $customer->id,
                'customer_name' => $customer->name,
                'email' => $customer->email,
                'total_orders' => $orderCount,
                'total_spent' => $totalSpent,
                'average_order_value' => $orderCount > 0 ? $totalSpent / $orderCount : 0,
                'first_order' => $orders->min('created_at'),
                'last_order' => $orders->max('created_at'),
            ];
        }
        
        usort($report, fn($a, $b) => $b['total_spent'] <=> $a['total_spent']);
        
        return $report;
    }

    public function getNewCustomers(string $startDate, string $endDate): Collection
    {
        $customers = Customer::all();
        
        $newCustomers = collect();
        
        foreach ($customers as $customer) {
            $createdAt = $customer->created_at->format('Y-m-d');
            
            if ($createdAt >= $startDate && $createdAt <= $endDate) {
                $firstOrder = Order::where('customer_id', $customer->id)
                    ->orderBy('created_at')
                    ->first();
                
                $newCustomers->push([
                    'customer_id' => $customer->id,
                    'name' => $customer->name,
                    'email' => $customer->email,
                    'registered_at' => $customer->created_at,
                    'first_order_at' => $firstOrder?->created_at,
                    'first_order_value' => $firstOrder?->total,
                ]);
            }
        }
        
        return $newCustomers;
    }

    public function getCustomerSegmentation(): array
    {
        $customers = Customer::all();
        
        $segments = [
            'vip' => [],
            'regular' => [],
            'occasional' => [],
            'inactive' => [],
        ];
        
        foreach ($customers as $customer) {
            $orders = $customer->orders()->where('status', 'completed')->get();
            $totalSpent = $orders->sum('total');
            $lastOrder = $orders->max('created_at');
            
            $daysSinceLastOrder = $lastOrder 
                ? now()->diffInDays($lastOrder) 
                : 999;
            
            if ($totalSpent >= 10000 && $daysSinceLastOrder < 90) {
                $segments['vip'][] = $customer->id;
            } elseif ($totalSpent >= 1000 && $daysSinceLastOrder < 180) {
                $segments['regular'][] = $customer->id;
            } elseif ($daysSinceLastOrder < 365) {
                $segments['occasional'][] = $customer->id;
            } else {
                $segments['inactive'][] = $customer->id;
            }
        }
        
        return [
            'vip_count' => count($segments['vip']),
            'regular_count' => count($segments['regular']),
            'occasional_count' => count($segments['occasional']),
            'inactive_count' => count($segments['inactive']),
        ];
    }
}
