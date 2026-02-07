import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';

describe('DataGrid', () => {
  it('ARIA roles: grid, row, gridcell, columnheader', () => {
    const data = generateTransactions(20, 0);
    const { container } = render(<DataGrid data={data} />);

    expect(
      screen.getByRole('grid', { name: /trading transactions/i })
    ).toBeInTheDocument();
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-rowcount');
    expect(grid).toHaveAttribute('aria-colcount');

    const columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders.length).toBeGreaterThan(0);

    const rows = container.querySelectorAll('tr[role="row"]');
    const cells = container.querySelectorAll('td[role="gridcell"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(cells.length).toBeGreaterThan(0);
  });
});
