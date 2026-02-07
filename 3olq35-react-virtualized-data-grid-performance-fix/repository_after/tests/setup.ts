import '@testing-library/jest-dom';
import { vi } from 'vitest';

const ROW_HEIGHT = 40;
const MOCK_VISIBLE_COUNT = 20;

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (config: { count: number; estimateSize: () => number }) => {
    const count = config.count;
    const size = config.estimateSize();
    const numVisible = Math.min(MOCK_VISIBLE_COUNT, count);
    const virtualItems = Array.from({ length: numVisible }, (_, i) => ({
      index: i,
      start: i * size,
      end: (i + 1) * size,
      size,
    }));
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * size,
      scrollToIndex: vi.fn(),
    };
  },
}));
