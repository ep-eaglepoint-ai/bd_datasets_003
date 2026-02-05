<?php

namespace App\Services\Reports;

use App\Models\Product;
use App\Models\OrderItem;
use Illuminate\Support\Collection;

class InventoryReportService
{
    public function getLowStockReport(int $threshold = 10): array
    {
        $products = Product::all();
        
        $lowStock = [];
        
        foreach ($products as $product) {
            if ($product->stock_quantity <= $threshold) {
                $category = $product->category;
                
                $recentSales = OrderItem::where('product_id', $product->id)
                    ->whereHas('order', function ($q) {
                        $q->where('created_at', '>=', now()->subDays(30));
                    })
                    ->sum('quantity');
                
                $lowStock[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'sku' => $product->sku,
                    'category' => $category->name,
                    'current_stock' => $product->stock_quantity,
                    'recent_sales_30d' => $recentSales,
                    'days_until_stockout' => $recentSales > 0 
                        ? round($product->stock_quantity / ($recentSales / 30), 1) 
                        : null,
                ];
            }
        }
        
        return $lowStock;
    }

    public function getInventoryValuation(): array
    {
        $products = Product::all();
        
        $totalValue = 0;
        $categoryValues = [];
        
        foreach ($products as $product) {
            $value = $product->stock_quantity * $product->price;
            $totalValue += $value;
            
            $categoryName = $product->category->name;
            
            if (!isset($categoryValues[$categoryName])) {
                $categoryValues[$categoryName] = 0;
            }
            
            $categoryValues[$categoryName] += $value;
        }
        
        return [
            'total_value' => $totalValue,
            'by_category' => $categoryValues,
            'product_count' => count($products),
        ];
    }

    public function getStockMovement(string $startDate, string $endDate): Collection
    {
        $products = Product::all();
        
        $movements = collect();
        
        foreach ($products as $product) {
            $sold = OrderItem::where('product_id', $product->id)
                ->whereHas('order', function ($q) use ($startDate, $endDate) {
                    $q->where('created_at', '>=', $startDate)
                      ->where('created_at', '<=', $endDate)
                      ->where('status', 'completed');
                })
                ->sum('quantity');
            
            if ($sold > 0) {
                $movements->push([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'quantity_sold' => $sold,
                    'current_stock' => $product->stock_quantity,
                ]);
            }
        }
        
        return $movements->sortByDesc('quantity_sold');
    }
}
