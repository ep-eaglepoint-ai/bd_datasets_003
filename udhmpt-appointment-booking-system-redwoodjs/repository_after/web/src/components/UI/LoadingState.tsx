import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface Props {
  isLoading: boolean;
  error?: string | Error | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'full' | 'skeleton';
}

export const LoadingState: React.FC<Props> = ({
  isLoading,
  error,
  children,
  fallback,
  errorFallback,
  size = 'md',
  variant = 'inline'
}) => {
  if (error) {
    if (errorFallback) {
      return <>{errorFallback}</>;
    }
    return (
      <div className={`${
        variant === 'full' ? 'min-h-[200px]' : 'py-4'
      } flex items-center justify-center`}>
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <svg className="h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">Something went wrong</p>
          <p className="text-red-500 text-sm mt-1">
            {error instanceof Error ? error.message : error}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (variant === 'skeleton') {
      return <SkeletonLoader size={size} />;
    }

    return (
      <div className={`${
        variant === 'full' ? 'min-h-[200px]' : 'py-4'
      } flex items-center justify-center`}>
        <LoadingSpinner size={size} />
      </div>
    );
  }

  return <>{children}</>;
};

const SkeletonLoader: React.FC<{ size: 'sm' | 'md' | 'lg' }> = ({ size }) => {
  const heightClasses = {
    sm: 'h-4',
    md: 'h-6',
    lg: 'h-8'
  };

  return (
    <div className="space-y-2">
      <div className={`${heightClasses[size]} bg-gray-200 rounded animate-pulse`}></div>
      <div className={`${heightClasses[size]} bg-gray-200 rounded animate-pulse w-5/6`}></div>
      <div className={`${heightClasses[size]} bg-gray-200 rounded animate-pulse w-4/6`}></div>
    </div>
  );
};
