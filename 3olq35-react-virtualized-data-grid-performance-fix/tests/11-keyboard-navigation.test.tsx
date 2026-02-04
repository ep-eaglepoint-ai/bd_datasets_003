import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('keyboard navigation: arrow keys and Page Up/Down', () => {
    const data = generateTransactions(100, 0);
    const { container, rerender } = render(<DataGrid data={data} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={data} />);

    const grid = screen.getByRole('grid', { name: /trading transactions/i });
    grid.focus();
    expect(grid).toHaveAttribute('tabIndex', '0');

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'PageDown' });
    fireEvent.keyDown(grid, { key: 'PageUp' });
    expect(grid).toBeInTheDocument();
  });
});
