import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('new data loads on scroll near bottom; footer count increases', () => {
    const initialData = generateTransactions(500, 0);
    const moreData = generateTransactions(500, 500);

    const { container, rerender } = render(
      <DataGrid data={initialData} onLoadMore={() => {}} />
    );
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={initialData} onLoadMore={() => {}} />);

    expect(screen.getByText(/Showing 500 of 500/)).toBeInTheDocument();

    rerender(
      <DataGrid
        data={[...initialData, ...moreData]}
        onLoadMore={() => {}}
      />
    );
    expect(screen.getByText(/Showing 1000 of 1000/)).toBeInTheDocument();
  });
});
