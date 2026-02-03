/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '../repository_after/web/src/components/UI/ErrorBoundary';
import { ErrorMessage } from '../repository_after/web/src/components/UI/ErrorMessage';
import { LoadingState } from '../repository_after/web/src/components/UI/LoadingState';
import { LoadingSpinner } from '../repository_after/web/src/components/UI/LoadingSpinner';
import { ProgressIndicator, LinearProgress } from '../repository_after/web/src/components/UI/ProgressIndicator';

describe('UI Components', () => {
  describe('ErrorBoundary', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    test('catches and displays error', async () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    test('provides custom fallback', () => {
      const CustomFallback = () => <div>Custom error fallback</div>;
      
      render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error fallback')).toBeInTheDocument();
    });

    test('shows error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error Details')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('ErrorMessage', () => {
    test('displays error message', () => {
      render(
        <ErrorMessage 
          error="Something went wrong" 
          title="Error Title"
        />
      );

      expect(screen.getByText('Error Title')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    test('handles Error objects', () => {
      const error = new Error('Detailed error message');
      render(<ErrorMessage error={error} />);

      expect(screen.getByText('Detailed error message')).toBeInTheDocument();
    });

    test('shows retry and dismiss buttons', () => {
      const onRetry = jest.fn();
      const onDismiss = jest.fn();

      const { container } = render(
        <ErrorMessage 
          error="Test error" 
          onRetry={onRetry}
          onDismiss={onDismiss}
        />
      );

      fireEvent.click(screen.getByText('Try Again'));
      expect(onRetry).toHaveBeenCalled();

      const dismissButtons = within(container).getAllByText('Dismiss');
      fireEvent.click(dismissButtons[0]);
      expect(onDismiss).toHaveBeenCalled();
    });

    test('renders different variants', () => {
      const { rerender } = render(
        <ErrorMessage error="Test" variant="inline" />
      );
      expect(screen.getByText('Test')).toBeInTheDocument();

      rerender(<ErrorMessage error="Test" variant="card" />);
      expect(screen.getByText('Test')).toBeInTheDocument();

      rerender(<ErrorMessage error="Test" variant="toast" />);
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  describe('LoadingSpinner', () => {
    test('renders spinner', () => {
      render(<LoadingSpinner />);
      
      const spinner = screen.getByRole('img', { hidden: true });
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin');
    });

    test('applies size classes', () => {
      const { rerender } = render(<LoadingSpinner size="sm" />);
      expect(screen.getByRole('img', { hidden: true })).toHaveClass('h-4 w-4');

      rerender(<LoadingSpinner size="lg" />);
      expect(screen.getByRole('img', { hidden: true })).toHaveClass('h-12 w-12');
    });

    test('applies color classes', () => {
      const { rerender } = render(<LoadingSpinner color="primary" />);
      expect(screen.getByRole('img', { hidden: true })).toHaveClass('text-blue-600');

      rerender(<LoadingSpinner color="white" />);
      expect(screen.getByRole('img', { hidden: true })).toHaveClass('text-white');
    });
  });

  describe('LoadingState', () => {
    test('shows loading state', () => {
      render(
        <LoadingState isLoading={true}>
          <div>Content</div>
        </LoadingState>
      );

      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    test('shows error state', () => {
      render(
        <LoadingState isLoading={false} error="Network error">
          <div>Content</div>
        </LoadingState>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    test('shows content when not loading and no error', () => {
      render(
        <LoadingState isLoading={false}>
          <div>Content</div>
        </LoadingState>
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    });

    test('uses custom fallbacks', () => {
      const loadingFallback = <div>Custom loading...</div>;
      const errorFallback = <div>Custom error</div>;

      const { rerender } = render(
        <LoadingState 
          isLoading={true} 
          fallback={loadingFallback}
        >
          <div>Content</div>
        </LoadingState>
      );

      expect(screen.getByText('Custom loading...')).toBeInTheDocument();

      rerender(
        <LoadingState 
          isLoading={false} 
          error="Test error"
          errorFallback={errorFallback}
        >
          <div>Content</div>
        </LoadingState>
      );

      expect(screen.getByText('Custom error')).toBeInTheDocument();
    });

    test('renders skeleton variant', () => {
      render(
        <LoadingState isLoading={true} variant="skeleton">
          <div>Content</div>
        </LoadingState>
      );

      // Check for skeleton loading elements
      const skeletonElements = document.querySelectorAll('.animate-pulse');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });

  describe('ProgressIndicator', () => {
    test('renders step progress', () => {
      const steps = [
        { id: '1', label: 'Step 1', completed: true },
        { id: '2', label: 'Step 2', completed: false, current: true },
        { id: '3', label: 'Step 3', completed: false }
      ];

      render(<ProgressIndicator steps={steps} />);

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Step 2')).toBeInTheDocument();
      expect(screen.getByText('Step 3')).toBeInTheDocument();

      // Check completed step has checkmark (path with d attribute)
      const checkmark = document.querySelector('path[d*="M5 13l4 4L19 7"]');
      expect(checkmark).toBeInTheDocument();
    });

    test('renders linear progress', () => {
      render(<LinearProgress value={50} showLabel />);

      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();

      const progressBar = document.querySelector('.bg-blue-600');
      expect(progressBar).toHaveStyle('width: 50%');
    });

    test('applies different colors to linear progress', () => {
      const { rerender } = render(<LinearProgress value={30} color="success" />);
      expect(document.querySelector('.bg-green-600')).toBeInTheDocument();

      rerender(<LinearProgress value={30} color="error" />);
      expect(document.querySelector('.bg-red-600')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    test('ErrorBoundary catches errors in child components', async () => {
      const ProblematicComponent = () => {
        const [shouldError, setShouldError] = React.useState(false);
        
        if (shouldError) {
          throw new Error('Component error');
        }
        
        return (
          <button onClick={() => setShouldError(true)}>
            Trigger Error
          </button>
        );
      };

      render(
        <ErrorBoundary>
          <ProblematicComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Trigger Error'));
      
      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    test('LoadingState handles async operations', async () => {
      const AsyncComponent = () => {
        const [loading, setLoading] = React.useState(false);
        const [error, setError] = React.useState<string | null>(null);
        const [data, setData] = React.useState<string | null>(null);

        const fetchData = async () => {
          setLoading(true);
          setError(null);
          try {
            await new Promise(resolve => setTimeout(resolve, 100));
            setData('Loaded data');
          } catch (err) {
            setError('Failed to load');
          } finally {
            setLoading(false);
          }
        };

        return (
          <div>
            <button onClick={fetchData}>Load Data</button>
            <LoadingState isLoading={loading} error={error}>
              {data && <div>{data}</div>}
            </LoadingState>
          </div>
        );
      };

      render(<AsyncComponent />);

      fireEvent.click(screen.getByText('Load Data'));
      
      // Should show loading
      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
      
      // Should show data after loading
      await waitFor(() => {
        expect(screen.getByText('Loaded data')).toBeInTheDocument();
      });
    });
  });
});
