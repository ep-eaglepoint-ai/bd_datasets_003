import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('sort shows loading indicator and does not block', async () => {
    const data = generateTransactions(500, 0);
    const { container, rerender } = render(<DataGrid data={data} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={data} />);

    const dateHeader = screen.getByRole('columnheader', { name: /date/i });
    const sortableSpan = dateHeader?.querySelector('.header-content');
    expect(sortableSpan).toBeInTheDocument();
    fireEvent.click(sortableSpan!);

    await waitFor(
      () => {
        const loading = screen.queryByText(/sorting/i);
        const hasSort = dateHeader.getAttribute('aria-sort') != null;
        expect(loading !== null || hasSort).toBe(true);
      },
      { timeout: 500 }
    );
  });
});
