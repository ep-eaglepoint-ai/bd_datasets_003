const VIEWPORT_HEIGHT = 600;
const ROW_HEIGHT = 40;
const OVERSCAN = 8;

export const MAX_DOM_DATA_ROWS =
  Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN + 5;

const BOUNDING_RECT = {
  top: 0,
  left: 0,
  right: 800,
  bottom: VIEWPORT_HEIGHT,
  width: 800,
  height: VIEWPORT_HEIGHT,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

export function stubScrollContainerDimensions(container: HTMLElement) {
  const gridEl = container.querySelector('.grid-container') as HTMLDivElement;
  if (gridEl) {
    Object.defineProperty(gridEl, 'clientHeight', {
      value: VIEWPORT_HEIGHT,
      configurable: true,
    });
    Object.defineProperty(gridEl, 'clientWidth', {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(gridEl, 'scrollHeight', {
      value: 100000,
      configurable: true,
    });
    Object.defineProperty(gridEl, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
    gridEl.getBoundingClientRect = () => BOUNDING_RECT;
  }
}
