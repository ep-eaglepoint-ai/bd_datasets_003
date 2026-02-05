const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000/index.html';

test.describe('Table Explorer', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        await page.waitForSelector('#table-body tr');
    });

    test.describe('Initial Render', () => {
        test('should render the table with all rows', async ({ page }) => {
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(8);
        });

        test('should display correct column headers', async ({ page }) => {
            const headers = await page.locator('thead th').allTextContents();
            expect(headers.map(h => h.trim())).toEqual(['ID', 'Name', 'Email', 'Status', 'Actions']);
        });

        test('should have Edit button for each row', async ({ page }) => {
            const editButtons = await page.locator('.btn-edit').count();
            expect(editButtons).toBe(8);
        });
    });

    test.describe('Search Functionality', () => {
        test('should filter rows by name', async ({ page }) => {
            await page.fill('#search-input', 'Alice');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(1);
            const name = await page.locator('#table-body tr td:nth-child(2)').textContent();
            expect(name).toBe('Alice Johnson');
        });

        test('should filter rows by email', async ({ page }) => {
            await page.fill('#search-input', 'bob@example');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(1);
        });

        test('should filter rows by status', async ({ page }) => {
            await page.fill('#search-input', 'Pending');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(2);
        });

        test('should filter rows by ID', async ({ page }) => {
            await page.fill('#search-input', '5');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(1);
        });

        test('should show no results message when no matches', async ({ page }) => {
            await page.fill('#search-input', 'xyz123nonexistent');
            const noResults = await page.locator('.no-results').textContent();
            expect(noResults).toBe('No records found');
        });

        test('should be case-insensitive', async ({ page }) => {
            await page.fill('#search-input', 'ALICE');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(1);
        });

        test('should not modify underlying data after search', async ({ page }) => {
            await page.fill('#search-input', 'Alice');
            await page.fill('#search-input', '');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(8);
        });

        test('search should preserve original data integrity', async ({ page }) => {
            const originalData = await page.evaluate(() => window.tableExplorer.getData());
            await page.fill('#search-input', 'test');
            await page.fill('#search-input', 'Alice');
            await page.fill('#search-input', '');
            const dataAfterSearch = await page.evaluate(() => window.tableExplorer.getData());
            expect(dataAfterSearch).toEqual(originalData);
        });
    });

    test.describe('Sort Functionality', () => {
        test('should sort by ID ascending when clicked', async ({ page }) => {
            await page.click('th[data-column="id"]');
            const firstId = await page.locator('#table-body tr:first-child td:first-child').textContent();
            expect(firstId).toBe('1');
        });

        test('should sort by ID descending on second click', async ({ page }) => {
            await page.click('th[data-column="id"]');
            await page.click('th[data-column="id"]');
            const firstId = await page.locator('#table-body tr:first-child td:first-child').textContent();
            expect(firstId).toBe('8');
        });

        test('should sort by name ascending', async ({ page }) => {
            await page.click('th[data-column="name"]');
            const firstName = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            expect(firstName).toBe('Alice Johnson');
        });

        test('should sort by name descending', async ({ page }) => {
            await page.click('th[data-column="name"]');
            await page.click('th[data-column="name"]');
            const firstName = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            expect(firstName).toBe('Helen Mirren');
        });

        test('should show ascending sort indicator', async ({ page }) => {
            await page.click('th[data-column="name"]');
            const header = page.locator('th[data-column="name"]');
            await expect(header).toHaveClass(/sort-asc/);
            await expect(header).toHaveAttribute('aria-sort', 'ascending');
        });

        test('should show descending sort indicator', async ({ page }) => {
            await page.click('th[data-column="name"]');
            await page.click('th[data-column="name"]');
            const header = page.locator('th[data-column="name"]');
            await expect(header).toHaveClass(/sort-desc/);
            await expect(header).toHaveAttribute('aria-sort', 'descending');
        });

        test('should not modify underlying data after sorting', async ({ page }) => {
            const originalData = await page.evaluate(() => window.tableExplorer.getData());
            await page.click('th[data-column="name"]');
            await page.click('th[data-column="id"]');
            const dataAfterSort = await page.evaluate(() => window.tableExplorer.getData());
            expect(dataAfterSort).toEqual(originalData);
        });

        test('should maintain sort when combined with search', async ({ page }) => {
            await page.click('th[data-column="name"]');
            await page.fill('#search-input', 'Active');
            const names = await page.locator('#table-body tr td:nth-child(2)').allTextContents();
            const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
            expect(names).toEqual(sortedNames);
        });
    });

    test.describe('Inline Edit Functionality', () => {
        test('should enter edit mode when Edit button clicked', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            const editInputs = await page.locator('#table-body tr:first-child .edit-input').count();
            expect(editInputs).toBe(3);
        });

        test('should show Save and Cancel buttons in edit mode', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await expect(page.locator('#table-body tr:first-child .btn-save')).toBeVisible();
            await expect(page.locator('#table-body tr:first-child .btn-cancel')).toBeVisible();
        });

        test('should disable other Edit buttons when editing', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            const disabledButtons = await page.locator('.btn-edit[disabled]').count();
            expect(disabledButtons).toBe(7);
        });

        test('should highlight editing row', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await expect(page.locator('#table-body tr:first-child')).toHaveClass(/editing/);
        });

        test('should save changes when Save clicked', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Updated Name');
            await page.click('.btn-save');
            const name = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            expect(name).toBe('Updated Name');
        });

        test('should update underlying data on save', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Data Updated');
            await page.click('.btn-save');
            const data = await page.evaluate(() => window.tableExplorer.getData());
            expect(data[0].name).toBe('Data Updated');
        });

        test('should revert changes when Cancel clicked', async ({ page }) => {
            const originalName = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Changed Name');
            await page.click('.btn-cancel');
            const name = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            expect(name).toBe(originalName);
        });

        test('should not modify data when Cancel clicked', async ({ page }) => {
            const originalData = await page.evaluate(() => window.tableExplorer.getData());
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Changed Name');
            await page.click('.btn-cancel');
            const dataAfterCancel = await page.evaluate(() => window.tableExplorer.getData());
            expect(dataAfterCancel).toEqual(originalData);
        });

        test('should exit edit mode after save', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.click('.btn-save');
            const editInputs = await page.locator('#table-body tr:first-child .edit-input').count();
            expect(editInputs).toBe(0);
        });

        test('should exit edit mode after cancel', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.click('.btn-cancel');
            const editInputs = await page.locator('#table-body tr:first-child .edit-input').count();
            expect(editInputs).toBe(0);
        });

        test('should re-enable Edit buttons after cancel', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.click('.btn-cancel');
            const disabledButtons = await page.locator('.btn-edit[disabled]').count();
            expect(disabledButtons).toBe(0);
        });
    });

    test.describe('Validation', () => {
        test('should show error when name is empty', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '');
            await page.click('.btn-save');
            await expect(page.locator('.error-message')).toBeVisible();
            await expect(page.locator('.error-message')).toContainText('Name cannot be empty');
        });

        test('should mark invalid input field', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '');
            await page.click('.btn-save');
            await expect(page.locator('.edit-input[data-field="name"]')).toHaveClass(/invalid/);
        });

        test('should not save when validation fails', async ({ page }) => {
            const originalData = await page.evaluate(() => window.tableExplorer.getData());
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '');
            await page.click('.btn-save');
            const dataAfterAttempt = await page.evaluate(() => window.tableExplorer.getData());
            expect(dataAfterAttempt).toEqual(originalData);
        });

        test('should remain in edit mode when validation fails', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '');
            await page.click('.btn-save');
            await expect(page.locator('#table-body tr:first-child')).toHaveClass(/editing/);
        });

        test('should clear error when user types valid input', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '');
            await page.click('.btn-save');
            await page.fill('.edit-input[data-field="name"]', 'Valid Name');
            await expect(page.locator('.edit-input[data-field="name"]')).not.toHaveClass(/invalid/);
        });

        test('should validate status field', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="status"]', 'InvalidStatus');
            await page.click('.btn-save');
            await expect(page.locator('.error-message')).toContainText('Status must be');
        });

        test('should show error for whitespace-only name', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', '   ');
            await page.click('.btn-save');
            await expect(page.locator('.error-message')).toContainText('Name cannot be empty');
        });
    });

    test.describe('Keyboard Accessibility', () => {
        test('should cancel edit with Escape key', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.keyboard.press('Escape');
            const editInputs = await page.locator('#table-body tr:first-child .edit-input').count();
            expect(editInputs).toBe(0);
        });

        test('should save edit with Enter key in input', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Enter Test');
            await page.locator('.edit-input[data-field="name"]').press('Enter');
            const name = await page.locator('#table-body tr:first-child td:nth-child(2)').textContent();
            expect(name).toBe('Enter Test');
        });

        test('should sort column with Enter key on header', async ({ page }) => {
            await page.focus('th[data-column="name"]');
            await page.keyboard.press('Enter');
            await expect(page.locator('th[data-column="name"]')).toHaveClass(/sort-asc/);
        });

        test('should sort column with Space key on header', async ({ page }) => {
            await page.focus('th[data-column="name"]');
            await page.keyboard.press('Space');
            await expect(page.locator('th[data-column="name"]')).toHaveClass(/sort-asc/);
        });

        test('should focus first input when entering edit mode', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            const focusedField = await page.evaluate(() => document.activeElement.dataset.field);
            expect(focusedField).toBe('name');
        });

        test('search input should be accessible', async ({ page }) => {
            await expect(page.locator('#search-input')).toHaveAttribute('aria-label', 'Search records');
        });

        test('column headers should have tabindex for keyboard navigation', async ({ page }) => {
            const headers = page.locator('th.sortable');
            const count = await headers.count();
            for (let i = 0; i < count; i++) {
                await expect(headers.nth(i)).toHaveAttribute('tabindex', '0');
            }
        });
    });

    test.describe('State Management', () => {
        test('should cancel edit when searching', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('#search-input', 'test');
            const editInputs = await page.locator('.edit-input').count();
            expect(editInputs).toBe(0);
        });

        test('should maintain edited data after sorting', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'Zebra User');
            await page.click('.btn-save');
            await page.click('th[data-column="name"]');
            const data = await page.evaluate(() => window.tableExplorer.getData());
            const zebra = data.find(d => d.name === 'Zebra User');
            expect(zebra).toBeDefined();
        });

        test('should maintain edited data after searching', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            await page.fill('.edit-input[data-field="name"]', 'SearchTest User');
            await page.click('.btn-save');
            await page.fill('#search-input', 'SearchTest');
            const rows = await page.locator('#table-body tr').count();
            expect(rows).toBe(1);
        });

        test('ID field should not be editable', async ({ page }) => {
            await page.click('#table-body tr:first-child .btn-edit');
            const idCell = await page.locator('#table-body tr:first-child td:first-child').textContent();
            expect(idCell).toBe('1');
            const idInputs = await page.locator('#table-body tr:first-child td:first-child input').count();
            expect(idInputs).toBe(0);
        });
    });
});
