import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { MAX_DOM_DATA_ROWS } from './helpers';

describe('DataGrid', () => {
  it('only visible rows plus overscan buffer rendered in DOM', () => {
    const data = generateTransactions(10000, 0);
    const { container } = render(<DataGrid data={data} />);

    const tbody = container.querySelector('.grid-table tbody');
    expect(tbody).toBeInTheDocument();
    const dataRows =
      tbody?.querySelectorAll('tr[role="row"]:not([aria-hidden="true"])') ?? [];
    const spacerRows = tbody?.querySelectorAll('tr[aria-hidden="true"]') ?? [];

    expect(dataRows.length).toBeLessThanOrEqual(MAX_DOM_DATA_ROWS);
    expect(dataRows.length).toBeGreaterThan(0);
    expect(spacerRows.length).toBeLessThanOrEqual(2);
  });
});
