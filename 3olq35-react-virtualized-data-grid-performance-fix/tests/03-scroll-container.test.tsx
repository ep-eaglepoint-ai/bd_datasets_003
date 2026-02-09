import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';

describe('DataGrid', () => {
  it('grid has scroll container for fluid scrolling', () => {
    const data = generateTransactions(100, 0);
    const { container } = render(<DataGrid data={data} />);
    const gridContainer = container.querySelector('.grid-container');
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass('grid-container');
  });
});
