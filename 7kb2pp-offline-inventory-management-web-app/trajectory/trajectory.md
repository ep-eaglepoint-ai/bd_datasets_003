# Trajectory - Offline Inventory Management Web App

## Task Overview
Build a fully offline inventory management web application using Next.js, TailwindCSS, Zod, Zustand, and IndexedDB. The application tracks, audits, analyzes, and optimizes assets with support for structured records, lifecycle tracking, change history, stock movement, valuation, and performance analytics. All business logic runs client-side without external APIs.

## Design Decisions

### 1. Technology Stack
- **Next.js 14**: React framework with App Router for modern web app structure
- **TypeScript**: Type safety throughout the codebase
- **TailwindCSS**: Utility-first CSS for rapid UI development
- **Zustand**: Lightweight state management with built-in persistence capabilities
- **Zod**: Runtime schema validation for data integrity
- **IndexedDB (via idb)**: Client-side database for offline persistence
- **Recharts**: Data visualization for analytics dashboards
- **react-window**: List virtualization for performance with large datasets

### 2. Data Model Architecture
Implemented comprehensive Zod schemas for all entities:
- **InventoryItem**: Core item with SKU, name, category, location, unit cost, reorder threshold, lifecycle status
- **Category/Location**: Organizational entities with hierarchical support
- **StockMovement**: Immutable log entries tracking all quantity changes
- **AuditLog**: Complete change history for all entities
- **ValuationSnapshot**: Point-in-time valuation records
- **InventoryHealth**: Computed health metrics

### 3. Quantity Calculation Strategy
Instead of storing quantity directly on items, quantities are computed from the immutable movement log:
- Ensures data consistency and auditability
- Enables historical quantity reconstruction
- Supports movement reversal/correction

### 4. State Management
Zustand store with:
- Memoized selectors for derived data (enriched items, health metrics)
- Async actions integrating with IndexedDB
- Automatic audit log generation for all mutations

## Implementation Steps

### Step 1: Project Setup
- Created Next.js project structure in `repository_after/`
- Configured TypeScript, TailwindCSS, Jest for testing
- Set up path aliases and module resolution

### Step 2: Schema Definitions
- Defined all Zod schemas in `src/lib/schemas.ts`
- Implemented lifecycle status enum (active, reserved, damaged, expired, archived, disposed)
- Implemented movement type enum (inbound, outbound, transfer, adjustment, correction)

### Step 3: IndexedDB Persistence Layer
- Implemented `src/lib/db.ts` using the `idb` library
- Created object stores for items, categories, locations, movements, audit logs, valuation snapshots
- Added CRUD operations with Zod validation on read/write

### Step 4: Calculation Utilities
- Implemented `src/lib/calculations.ts` with deterministic functions:
  - `calculateItemQuantity`: Sum movements for an item
  - `calculateItemValue`: quantity × unitCost
  - `enrichItemsWithQuantities`: Augment items with computed values
  - `calculateInventoryHealth`: Composite health score from multiple metrics
  - `identifySlowMovingItems`, `identifyOverstockItems`: Alert detection

### Step 5: Zustand Store
- Implemented `src/lib/store.ts` with full CRUD operations
- Integrated IndexedDB persistence
- Added memoized selectors for filtered items and analytics
- Implemented bulk operations and export/import functionality

### Step 6: UI Components
- **Dashboard**: Metrics overview, charts (valuation trend, category distribution, lifecycle status)
- **InventoryList**: Virtualized list with search, filter, sort, and stock adjustment modal
- **ItemForm**: Create/edit items with validation
- **CategoryManager/LocationManager**: CRUD for organizational entities
- **MovementHistory**: Filterable stock movement log
- **AuditLogs**: Complete change history viewer
- **ExportImport**: JSON/CSV export and JSON import

### Step 7: Testing
- Schema validation tests covering all data models
- Calculation tests for quantity, value, health metrics
- Edge case handling for empty data sets

### Step 8: Docker Configuration
- Node.js 20 base image
- Single `app` service in docker-compose
- Separate commands for tests and evaluation

## Key Files
- `repository_after/src/lib/schemas.ts` - Zod schema definitions
- `repository_after/src/lib/db.ts` - IndexedDB persistence layer
- `repository_after/src/lib/calculations.ts` - Business logic calculations
- `repository_after/src/lib/store.ts` - Zustand state management
- `repository_after/src/app/page.tsx` - Main application page
- `repository_after/src/components/` - UI components
- `tests/` - Jest test suites
- `evaluation/run_evaluation.ts` - Evaluation runner

## Verification
Run tests with: `docker-compose run app npm test`
Run evaluation with: `docker-compose run app npx ts-node ../evaluation/run_evaluation.ts`

