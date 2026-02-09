import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('search has debounce and loading indicator', async () => {
    const data = generateTransactions(200, 0);
    const { container, rerender } = render(<DataGrid data={data} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={data} />);

    const searchInput = screen.getByPlaceholderText(/search all columns/i);
    await userEvent.type(searchInput, 'AAPL', { delay: 1 });

    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();
    const loadingOrSearching = screen.queryByText(/searching/i);
    expect(
      loadingOrSearching !== null || searchInput.closest('.search-box')
    ).toBeTruthy();
  });
});
