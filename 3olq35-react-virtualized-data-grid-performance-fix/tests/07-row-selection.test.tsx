import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';

describe('DataGrid', () => {
  it('row selection only affects that row (memoized)', () => {
    const data = generateTransactions(50, 0);
    const { container } = render(<DataGrid data={data} />);

    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    const firstRowCheckbox = checkboxes[0] as HTMLInputElement;
    expect(firstRowCheckbox).not.toBeChecked();
    fireEvent.click(firstRowCheckbox);
    expect(firstRowCheckbox).toBeChecked();
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });
});
