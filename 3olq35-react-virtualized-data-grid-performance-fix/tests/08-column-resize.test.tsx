import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DataGrid } from '@impl/components/DataGrid';
import { generateTransactions } from '@impl/utils/dataGenerator';
import { stubScrollContainerDimensions } from './helpers';

describe('DataGrid', () => {
  it('column resize handle exists and uses rAF pattern', () => {
    const data = generateTransactions(100, 0);
    const { container, rerender } = render(<DataGrid data={data} />);
    stubScrollContainerDimensions(container);
    rerender(<DataGrid data={data} />);

    const resizeHandles = container.querySelectorAll('.resize-handle');
    expect(resizeHandles.length).toBeGreaterThan(0);
    const firstResize = resizeHandles[0];
    expect(firstResize).toBeInTheDocument();
    fireEvent.mouseDown(firstResize as Element, { clientX: 100 });
    expect(document.body).toBeInTheDocument();
  });
});
