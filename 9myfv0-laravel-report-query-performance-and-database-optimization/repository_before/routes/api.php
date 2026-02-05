<?php

use App\Http\Controllers\ReportController;
use Illuminate\Support\Facades\Route;

Route::prefix('reports')->group(function () {
    Route::get('/sales', [ReportController::class, 'salesReport']);
    Route::get('/daily-sales', [ReportController::class, 'dailySales']);
    Route::get('/top-products', [ReportController::class, 'topProducts']);
    Route::get('/low-stock', [ReportController::class, 'lowStock']);
    Route::get('/inventory-valuation', [ReportController::class, 'inventoryValuation']);
    Route::get('/stock-movement', [ReportController::class, 'stockMovement']);
    Route::get('/customer-ltv', [ReportController::class, 'customerLifetimeValue']);
    Route::get('/new-customers', [ReportController::class, 'newCustomers']);
    Route::get('/customer-segments', [ReportController::class, 'customerSegmentation']);
});
