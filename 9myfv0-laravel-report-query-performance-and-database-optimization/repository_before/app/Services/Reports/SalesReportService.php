<?php

namespace App\Services\Reports;

use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class SalesReportService
{
    public function generateSalesReport(string $startDate, string $endDate): array
    {
        $orders = Order::where('created_at', '>=', $startDate)
            ->where('created_at', '<=', $endDate)
            ->where('status', 'completed')
            ->get();

        $reportData = [];
        $totalRevenue = 0;
        $totalOrders = count($orders);

        foreach ($orders as $order) {
            $customer = $order->customer;
            $items = $order->items;
            
            foreach ($items as $item) {
                $product = $item->product;
                $category = $product->category;
                
                $reportData[] = [
                    'order_id' => $order->id,
                    'date' => $order->created_at->format('Y-m-d'),
                    'customer_name' => $customer->name,
                    'customer_email' => $customer->email,
                    'product_name' => $product->name,
                    'category' => $category->name,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->price,
                    'line_total' => $item->quantity * $item->price,
                ];
                
                $totalRevenue += $item->quantity * $item->price;
            }
        }

        return [
            'data' => $reportData,
            'summary' => [
                'total_orders' => $totalOrders,
                'total_revenue' => $totalRevenue,
                'average_order_value' => $totalOrders > 0 ? $totalRevenue / $totalOrders : 0,
            ],
        ];
    }

    public function getDailySales(string $startDate, string $endDate): Collection
    {
        $sales = collect();
        
        $orders = Order::where('status', 'completed')->get();
        
        foreach ($orders as $order) {
            $orderDate = $order->created_at->format('Y-m-d');
            
            if ($orderDate >= $startDate && $orderDate <= $endDate) {
                if (!$sales->has($orderDate)) {
                    $sales[$orderDate] = [
                        'date' => $orderDate,
                        'order_count' => 0,
                        'revenue' => 0,
                    ];
                }
                
                $sales[$orderDate]['order_count']++;
                $sales[$orderDate]['revenue'] += $order->total;
            }
        }
        
        return $sales->sortKeys();
    }

    public function getTopProducts(string $startDate, string $endDate, int $limit = 10): array
    {
        $items = OrderItem::all();
        
        $productSales = [];
        
        foreach ($items as $item) {
            $order = $item->order;
            
            if ($order->status !== 'completed') {
                continue;
            }
            
            if ($order->created_at->format('Y-m-d') < $startDate || 
                $order->created_at->format('Y-m-d') > $endDate) {
                continue;
            }
            
            $productId = $item->product_id;
            
            if (!isset($productSales[$productId])) {
                $productSales[$productId] = [
                    'product_id' => $productId,
                    'product_name' => $item->product->name,
                    'total_quantity' => 0,
                    'total_revenue' => 0,
                ];
            }
            
            $productSales[$productId]['total_quantity'] += $item->quantity;
            $productSales[$productId]['total_revenue'] += $item->quantity * $item->price;
        }
        
        usort($productSales, fn($a, $b) => $b['total_revenue'] <=> $a['total_revenue']);
        
        return array_slice($productSales, 0, $limit);
    }
}
