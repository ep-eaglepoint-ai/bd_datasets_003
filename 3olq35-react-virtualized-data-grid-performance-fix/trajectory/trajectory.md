# Trajectory

## The Problem

A financial trading dashboard displays large transaction datasets but suffers from severe performance issues. The current implementation renders **all rows in the DOM** at once, causing slow initial load, janky scrolling, and browser crashes on mobile. Sorting and filtering freeze the UI, the search input re-renders the grid on every keystroke, row selection re-renders the entire grid, and memory grows unbounded during scrolling. There are no loading indicators, and the grid lacks keyboard navigation and proper ARIA structure for accessibility.

---

## The Solution

Optimize the grid so it handles large (and effectively unlimited) data with smooth scrolling and stable memory while keeping all existing behavior. Use **TanStack Virtual** to render only visible rows plus an overscan buffer, **debounce** search, make sort **non-blocking** with **startTransition**, keep **row selection** and **column resize** from triggering full re-renders, support **infinite scroll**, **preserve scroll position** after filter/sort, add **keyboard navigation** (arrow keys, Page Up/Down), and expose correct **ARIA** roles. Add a shared test suite that **passes** in the optimized repo and **fails in some or all** cases in the original repo, and an **evaluation script** that produces **report.json**.

---

## Implementation Steps

### 1. Virtualization (repository_after)

- **DataGrid.tsx**
  - Use **TanStack Virtual** (`useVirtualizer`) with a scroll container ref, fixed row height (40px), and overscan (8).
  - Derive **filteredData** in **useMemo** from `data`, `searchTerm`, `filters`, and `sort`.
  - Render only **virtual items**: top spacer `<tr>`, visible data rows via **GridRow**, bottom spacer `<tr>` so the table body has correct total height and scrollbar.
  - Wrap handlers in **useCallback** so child components can be memoized.
- **App.tsx**
  - Start with a chunk of data (e.g. 2000 rows) and pass **onLoadMore** so the grid can request more when the user scrolls near the bottom.
- **dataGenerator.ts**
  - Add optional **startIndex** to **generateTransactions(count, startIndex)** so appended chunks have correct IDs (`txn-0` … `txn-1999`, then `txn-2000` …).

**Result:** Only visible rows plus overscan are in the DOM; initial render is fast and memory stays bounded.

### 2. Debounced search and non-blocking sort

- **FilterBar.tsx**
  - Keep a **local display value** for the search input; **debounce** (300ms) before calling **onSearch(displayValue)** so the grid does not filter on every keystroke.
  - Show a **“Searching…”** indicator when `displayValue !== searchTerm` (or when a loading prop is true).
- **DataGrid.tsx**
  - On sort, **save scroll position** in a ref, set **isSorting** to true, and wrap **setSort** in **startTransition** so the UI stays responsive.
  - Clear **isSorting** in a **useEffect** after the sort state has updated (e.g. after **requestAnimationFrame**).
- **GridHeader.tsx**
  - Accept **isSorting** and show **“Sorting…”** next to the sorted column header when sorting.

**Result:** Search does not run on every keystroke; sort does not block the main thread; users see loading feedback where appropriate.

### 3. Row selection and column resize without full re-renders

- **GridRow.tsx**
  - Export the row component wrapped in **React.memo** so only the row whose selection (or data) changed re-renders.
- **DataGrid.tsx**
  - Keep **handleSelectRow** and **handleSelectAll** as **useCallback** with stable dependencies so **GridRow** receives stable props.
- **GridHeader.tsx**
  - For column resize, use **requestAnimationFrame** and a ref for the latest mouse X so at most one width update per frame; avoid layout thrashing.

**Result:** Selecting or deselecting a row re-renders only that row; column resize is smooth.

### 4. Infinite scroll and scroll position

- **DataGrid.tsx**
  - Accept optional **onLoadMore**; when the last visible virtual index is near the end of **filteredData** (e.g. within 10), call **onLoadMore()** once and use a ref to avoid repeated calls until **data.length** increases.
  - Before updating **searchTerm**, **filters**, or **sort**, store **scrollTop** in a ref; in **useLayoutEffect** after **filteredData.length** / **totalSize** change, restore **scrollTop** (capped by max scroll) so the user is not jumped to the top.
- **App.tsx**
  - Hold **transactions** in state, initially **generateTransactions(2000, 0)**; **handleLoadMore** appends the next chunk (e.g. 2000) up to a maximum (e.g. 100k) using **generateTransactions(2000, prev.length)**.

**Result:** Footer count increases as the user scrolls; scroll position is maintained or restored after filter/sort.

### 5. Keyboard navigation and ARIA

- **DataGrid.tsx**
  - Give the grid container **tabIndex={0}**, **role="grid"**, **aria-label**, **aria-rowcount**, **aria-colcount**, and **onKeyDown**.
  - On **ArrowDown** / **ArrowUp** / **PageDown** / **PageUp**, update a **focusedRowIndex** state (clamped to **filteredData.length**) and call **rowVirtualizer.scrollToIndex(focusedRowIndex)** so the focused row stays in view.
- **GridHeader.tsx**
  - Use **role="row"** on the header row, **role="columnheader"** on each **th**, **aria-sort** and **aria-colindex** where appropriate.
- **GridRow.tsx**
  - Use **role="row"**, **aria-rowindex**; each cell **role="gridcell"** and **aria-colindex**.

**Result:** Users can move focus with arrow keys and Page Up/Down; screen readers get a proper grid structure.

### 6. Tests and evaluation

- **Main tests folder (../tests/)**
  - One test file per acceptance criterion (e.g. **01-visible-rows**, **02-interactive-without-freeze**, … **12-aria-roles**), each importing from **@impl** so the same suite can run against either repo.
  - **repository_after** and **repository_before** both set **resolve.alias['@impl']** to their own **src** in **vite.config.ts**; **repository_after** adds a **useVirtualizer** mock in **tests/setup.ts** so virtualization tests pass in jsdom.
- **repository_before**
  - Add **Vitest**, **@testing-library/react**, **jsdom**, etc.; **vite.config.ts** test section with **include: ['../tests/**/*.test.tsx']** and same testing-library aliases; **tests/setup.ts**; **generateTransactions(count, startIndex?)** and **DataGrid** with optional **onLoadMore** so the suite type-checks and runs.
- **evaluation/evaluate.mjs**
  - Run **vitest run --reporter=json --outputFile=...** from **repository_before** and **repository_after** (write JSON to a **.tmp** directory).
  - Parse both JSON outputs, build a summary (e.g. **repository_before**, **repository_after**, **summary.after_all_passed**, **summary.evaluation**: `"pass"` if after has 12/12 passing).
  - Write **evaluation/report.json**; delete the temporary Vitest JSON files and the **.tmp** directory so only **report.json** remains in **evaluation/**.

**Result:** `npm test` from **repository_after** yields 12/12 passing; from **repository_before** several tests fail (e.g. visible rows, DOM bounded, ARIA, keyboard). Running **node evaluation/evaluate.mjs** produces **report.json** with no **after.json** or **before.json** left in the evaluation folder.

---

## Why I Did It This Way

- **Virtualization with TanStack Virtual** keeps the DOM to a small, fixed set of rows (visible + overscan), which fixes initial load, scroll smoothness, and memory growth without changing the data format or API. Spacer rows in the table body preserve correct scroll height and avoid layout jumps.
- **useMemo for filteredData** and **useCallback for handlers** limit re-renders and allow **React.memo** on **GridRow** so selection and other updates only touch the affected row.
- **Debounced search** and **startTransition** for sort keep the UI responsive and match the requirement that filtering and sorting do not block interaction; loading indicators give clear feedback.
- **requestAnimationFrame** for column resize batches layout updates and avoids jank. **Scroll position restore** in **useLayoutEffect** keeps the user’s place after filter/sort without extra dependencies.
- **Infinite scroll** via **onLoadMore** and chunked **generateTransactions** satisfies “load more as you scroll” while keeping the first load small; the same **DataGrid** API works for both “all data” and “growing list” use cases.
- **Keyboard navigation** and **ARIA** roles are implemented on the existing table structure so the grid is usable from the keyboard and with screen readers without changing the visual design.
- **Single test suite with @impl** lets one set of tests validate both the original and optimized implementations; failures in **repository_before** and passes in **repository_after** demonstrate that the optimizations meet the criteria. **Vitest JSON** written to a temp dir and then removed keeps the evaluation folder clean and only **report.json** as the artifact.
