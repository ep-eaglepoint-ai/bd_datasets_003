/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResponsiveLayout, Container, Grid } from '../repository_after/web/src/components/UI/ResponsiveLayout';

// Mock window.matchMedia for responsive testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('ResponsiveLayout Components', () => {
  describe('Container', () => {
    test('renders with default size', () => {
      render(
        <Container>
          <div>Test content</div>
        </Container>
      );

      const container = screen.getByText('Test content').parentElement;
      expect(container).toHaveClass('max-w-7xl');
    });

    test('renders with different sizes', () => {
      const { rerender } = render(
        <Container size="sm">
          <div>Small container</div>
        </Container>
      );
      expect(screen.getByText('Small container').parentElement).toHaveClass('max-w-2xl');

      rerender(
        <Container size="xl">
          <div>Extra large container</div>
        </Container>
      );
      expect(screen.getByText('Extra large container').parentElement).toHaveClass('max-w-screen-xl');
    });

    test('applies custom className', () => {
      render(
        <Container className="custom-class">
          <div>Content</div>
        </Container>
      );

      const container = screen.getByText('Content').parentElement;
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Grid', () => {
    test('renders with default columns', () => {
      render(
        <Grid>
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );

      const grid = screen.getByText('Item 1').parentElement;
      expect(grid).toHaveClass('grid-cols-1');
    });

    test('renders with different column counts', () => {
      const { rerender } = render(
        <Grid cols={2}>
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );
      expect(screen.getByText('Item 1').parentElement).toHaveClass('grid-cols-1', 'sm:grid-cols-2');

      rerender(
        <Grid cols={4}>
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );
      expect(screen.getByText('Item 1').parentElement).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4');
    });

    test('renders with different gaps', () => {
      const { rerender } = render(
        <Grid gap="sm">
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );
      expect(screen.getByText('Item 1').parentElement).toHaveClass('gap-2');

      rerender(
        <Grid gap="lg">
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );
      expect(screen.getByText('Item 1').parentElement).toHaveClass('gap-6');
    });

    test('applies custom className', () => {
      render(
        <Grid className="custom-grid">
          <div>Item 1</div>
        </Grid>
      );

      const grid = screen.getByText('Item 1').parentElement;
      expect(grid).toHaveClass('custom-grid');
    });
  });

  describe('ResponsiveLayout', () => {
    test('renders without sidebar', () => {
      render(
        <ResponsiveLayout>
          <div>Main content</div>
        </ResponsiveLayout>
      );

      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    test('renders with sidebar', () => {
      render(
        <ResponsiveLayout
          sidebar={<div>Sidebar content</div>}
        >
          <div>Main content</div>
        </ResponsiveLayout>
      );

      expect(screen.getByText('Sidebar content')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    test('renders with header', () => {
      render(
        <ResponsiveLayout
          header={<div>Header content</div>}
        >
          <div>Main content</div>
        </ResponsiveLayout>
      );

      expect(screen.getByText('Header content')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    test('renders with footer', () => {
      render(
        <ResponsiveLayout
          footer={<div>Footer content</div>}
        >
          <div>Main content</div>
        </ResponsiveLayout>
      );

      expect(screen.getByText('Footer content')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    test('renders with all sections', () => {
      render(
        <ResponsiveLayout
          header={<div>Header</div>}
          sidebar={<div>Sidebar</div>}
          footer={<div>Footer</div>}
        >
          <div>Main content</div>
        </ResponsiveLayout>
      );

      expect(screen.getByText('Header')).toBeInTheDocument();
      expect(screen.getByText('Sidebar')).toBeInTheDocument();
      expect(screen.getByText('Main content')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    test('applies custom className', () => {
      render(
        <ResponsiveLayout className="custom-layout">
          <div>Content</div>
        </ResponsiveLayout>
      );

      const layout = screen.getByText('Content').closest('.min-h-screen');
      expect(layout).toHaveClass('custom-layout');
    });
  });

  describe('Responsive Behavior', () => {
    test('Grid adapts to screen sizes', () => {
      // Mock different screen sizes
      const mockMatchMedia = (matches: boolean) => {
        window.matchMedia = jest.fn().mockImplementation(query => ({
          matches,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }));
      };

      // Mobile view (default)
      mockMatchMedia(false);
      const { rerender } = render(
        <Grid cols={3}>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </Grid>
      );

      let grid = screen.getByText('Item 1').parentElement;
      expect(grid).toHaveClass('grid-cols-1');

      // Desktop view
      mockMatchMedia(true);
      rerender(
        <Grid cols={3}>
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </Grid>
      );

      grid = screen.getByText('Item 1').parentElement;
      expect(grid).toHaveClass('lg:grid-cols-3');
    });
  });

  describe('Accessibility', () => {
    test('ResponsiveLayout maintains semantic structure', () => {
      render(
        <ResponsiveLayout
          header={<div>Header</div>}
          sidebar={<div>Sidebar</div>}
          footer={<div>Footer</div>}
        >
          <main>Main content</main>
        </ResponsiveLayout>
      );

      // Check for semantic elements
      expect(document.querySelector('header')).toBeInTheDocument();
      expect(document.querySelector('main')).toBeInTheDocument();
      expect(document.querySelector('footer')).toBeInTheDocument();
    });

    test('Grid maintains proper structure for screen readers', () => {
      render(
        <Grid cols={2}>
          <div>Item 1</div>
          <div>Item 2</div>
        </Grid>
      );

      const grid = screen.getByText('Item 1').parentElement;
      expect(grid).toHaveAttribute('role', 'grid');
    });
  });
});
