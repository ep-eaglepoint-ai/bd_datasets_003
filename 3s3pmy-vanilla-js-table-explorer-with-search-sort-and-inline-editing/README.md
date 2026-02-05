# 3S3PMY - Vanilla JS Table Explorer with Search, Sort, and Inline Editing

A single-file HTML table explorer built with vanilla HTML, CSS, and JavaScript. Features include:
- Search filtering across all columns
- Column sorting with ascending/descending toggle
- Inline editing with save/cancel operations
- Validation (name cannot be empty, status must be valid)
- Full keyboard accessibility

## Project Structure

```
├── repository_before/    # Empty (new feature development)
├── repository_after/     # Implementation
│   └── index.html        # Single-file table explorer
├── tests/
│   └── table.spec.js     # Playwright test suite
├── evaluation/
│   └── evaluate.js       # Generates report.json
├── Dockerfile            # Playwright container
├── docker-compose.yml    # Test and evaluation services
└── package.json          # Node.js dependencies
```

## Before Test Docker Command

```bash
docker-compose run --rm test-before
```

Note: This will fail as repository_before is empty (new feature development task).

## After Test Docker Command

```bash
docker-compose run --rm test-after
```

This runs all Playwright tests against the implemented table explorer.

## Evaluation Docker Command

```bash
docker-compose run --rm evaluation
```

Generates `report.json` with:
- `FAIL_TO_PASS`: Tests that failed before but pass after
- `PASS_TO_PASS`: Tests that passed in both (none for new feature)

## Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run tests
npm test

# Serve the app locally
npx http-server repository_after -p 3000
```

Then open http://localhost:3000/index.html in your browser.

## Test Categories

1. **Initial Render** - Table displays correctly with all data
2. **Search Functionality** - Filtering works without data corruption
3. **Sort Functionality** - Sorting with visual indicators
4. **Inline Edit** - Save/cancel behavior
5. **Validation** - Prevents invalid data from being saved
6. **Keyboard Accessibility** - All operations via keyboard
7. **State Management** - Data integrity across operations
