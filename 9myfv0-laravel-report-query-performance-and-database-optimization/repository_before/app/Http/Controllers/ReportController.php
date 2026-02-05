<?php

namespace App\Http\Controllers;

use App\Services\Reports\SalesReportService;
use App\Services\Reports\InventoryReportService;
use App\Services\Reports\CustomerReportService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ReportController extends Controller
{
    public function __construct(
        private SalesReportService $salesService,
        private InventoryReportService $inventoryService,
        private CustomerReportService $customerService,
    ) {}

    public function salesReport(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subMonth()->format('Y-m-d'));
        $endDate = $request->input('end_date', now()->format('Y-m-d'));

        $report = $this->salesService->generateSalesReport($startDate, $endDate);

        return response()->json($report);
    }

    public function dailySales(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subMonth()->format('Y-m-d'));
        $endDate = $request->input('end_date', now()->format('Y-m-d'));

        $sales = $this->salesService->getDailySales($startDate, $endDate);

        return response()->json($sales);
    }

    public function topProducts(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subMonth()->format('Y-m-d'));
        $endDate = $request->input('end_date', now()->format('Y-m-d'));
        $limit = $request->input('limit', 10);

        $products = $this->salesService->getTopProducts($startDate, $endDate, $limit);

        return response()->json($products);
    }

    public function lowStock(Request $request): JsonResponse
    {
        $threshold = $request->input('threshold', 10);

        $report = $this->inventoryService->getLowStockReport($threshold);

        return response()->json($report);
    }

    public function inventoryValuation(): JsonResponse
    {
        $report = $this->inventoryService->getInventoryValuation();

        return response()->json($report);
    }

    public function stockMovement(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subMonth()->format('Y-m-d'));
        $endDate = $request->input('end_date', now()->format('Y-m-d'));

        $movements = $this->inventoryService->getStockMovement($startDate, $endDate);

        return response()->json($movements);
    }

    public function customerLifetimeValue(): JsonResponse
    {
        $report = $this->customerService->getCustomerLifetimeValue();

        return response()->json($report);
    }

    public function newCustomers(Request $request): JsonResponse
    {
        $startDate = $request->input('start_date', now()->subMonth()->format('Y-m-d'));
        $endDate = $request->input('end_date', now()->format('Y-m-d'));

        $customers = $this->customerService->getNewCustomers($startDate, $endDate);

        return response()->json($customers);
    }

    public function customerSegmentation(): JsonResponse
    {
        $segments = $this->customerService->getCustomerSegmentation();

        return response()->json($segments);
    }
}
