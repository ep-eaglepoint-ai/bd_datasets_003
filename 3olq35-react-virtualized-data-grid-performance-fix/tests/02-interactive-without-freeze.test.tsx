import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('page becomes interactive without loading spinner or freeze', () => {
    const data = generateTransactions(5000, 0);
    const { container, rerender } = render(<DataGrid data={data} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={data} />);

    expect(screen.queryByText(/loading|spinner/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('grid', { name: /trading transactions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/search all columns/i)
    ).toBeInTheDocument();
  });
});
