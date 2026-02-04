import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions, MAX_DOM_DATA_ROWS } from './helpers';

describe('DataGrid', () => {
  it('virtualization keeps DOM bounded (memory stability)', () => {
    const large = generateTransactions(20000, 0);
    const { container, rerender } = render(<DataGrid data={large} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={large} />);
    const dataRows = container.querySelectorAll(
      'tbody tr[role="row"]:not([aria-hidden="true"])'
    );
    expect(dataRows.length).toBeLessThanOrEqual(MAX_DOM_DATA_ROWS);
  });
});
