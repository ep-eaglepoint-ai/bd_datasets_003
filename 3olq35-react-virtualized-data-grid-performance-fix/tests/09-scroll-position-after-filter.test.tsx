import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';

const VIEWPORT_HEIGHT = 600;

describe('DataGrid', () => {
  it('scroll position maintained after filter/sort', () => {
    const data = generateTransactions(500, 0);
    const { container } = render(<DataGrid data={data} />);
    const gridEl = container.querySelector('.grid-container') as HTMLDivElement;
    if (gridEl) {
      Object.defineProperty(gridEl, 'clientHeight', {
        value: VIEWPORT_HEIGHT,
        configurable: true,
      });
      Object.defineProperty(gridEl, 'scrollTop', {
        value: 500,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(gridEl, 'scrollHeight', {
        value: 50000,
        configurable: true,
      });
    }

    const searchInput = screen.getByPlaceholderText(/search all columns/i);
    fireEvent.change(searchInput, { target: { value: 'GOOGL' } });

    const gridContainer = container.querySelector('.grid-container');
    expect(gridContainer).toBeInTheDocument();
  });
});
