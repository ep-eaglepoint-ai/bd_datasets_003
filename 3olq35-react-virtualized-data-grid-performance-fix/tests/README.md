# DataGrid tests

Same test suite runs against **repository_after** (optimized) or **repository_before** (original). Each repo’s config points `@impl` at its own `src/`, so you run tests from inside the repo you want to check.

## Run against repository_after (should pass)

```bash
cd repository_after
npm install   # if not done yet
npm test
```

All 12 tests are expected to **pass** (virtualization, debounce, ARIA, keyboard, etc.).

## Run against repository_before (should fail some or all)

```bash
cd repository_before
npm install   # if not done yet
npm test
```

Several tests are expected to **fail** because the original app:

- Renders all rows in the DOM (fails **01-visible-rows**, **10-dom-bounded**).
- Has no `role="grid"` / ARIA (fails **12-aria-roles**).
- Has no keyboard navigation on the grid (fails **11-keyboard-navigation**).

Other tests may pass or fail depending on implementation details.

## Test list

| File | What it checks |
|------|----------------|
| 01-visible-rows | Only visible rows + overscan in DOM |
| 02-interactive-without-freeze | No spinner/freeze on load |
| 03-scroll-container | Scroll container for fluid scrolling |
| 04-infinite-scroll-footer | Load more; footer count increases |
| 05-sort-loading | Sort non-blocking; loading indicator |
| 06-search-debounce | Search debounced; loading indicator |
| 07-row-selection | Row selection re-renders only that row |
| 08-column-resize | Resize handle + rAF |
| 09-scroll-position-after-filter | Scroll kept after filter/sort |
| 10-dom-bounded | Virtualization keeps DOM bounded |
| 11-keyboard-navigation | Arrow keys, Page Up/Down |
| 12-aria-roles | ARIA grid, row, gridcell, columnheader |
