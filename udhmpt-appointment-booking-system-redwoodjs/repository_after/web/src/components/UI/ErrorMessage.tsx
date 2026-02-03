import React from 'react';

interface Props {
  error: string | Error | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'inline' | 'card' | 'toast';
  title?: string;
}

export const ErrorMessage: React.FC<Props> = ({
  error,
  onRetry,
  onDismiss,
  variant = 'inline',
  title = 'Error'
}) => {
  if (!error) return null;

  const errorMessage = error instanceof Error ? error.message : error;

  const baseClasses = "flex items-center p-4 rounded-md";
  const variantClasses = {
    inline: "bg-red-50 border border-red-200",
    card: "bg-white shadow-lg border border-red-200",
    toast: "bg-red-600 text-white shadow-lg"
  };

  const textClasses = {
    inline: "text-red-800",
    card: "text-red-800", 
    toast: "text-white"
  };

  const iconClasses = {
    inline: "text-red-400",
    card: "text-red-400",
    toast: "text-red-100"
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]}`}>
      <div className="flex-shrink-0">
        <svg className={`h-5 w-5 ${iconClasses[variant]}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="ml-3 flex-1">
        <h3 className={`text-sm font-medium ${textClasses[variant]}`}>
          {title}
        </h3>
        <div className={`mt-1 text-sm ${textClasses[variant]}`}>
          {errorMessage}
        </div>
        {(onRetry || onDismiss) && (
          <div className="mt-3 flex space-x-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className={`text-sm font-medium underline ${
                  variant === 'toast' ? 'text-white hover:text-red-100' : 'text-red-600 hover:text-red-500'
                }`}
              >
                Try Again
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={`text-sm font-medium underline ${
                  variant === 'toast' ? 'text-white hover:text-red-100' : 'text-red-600 hover:text-red-500'
                }`}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              onClick={onDismiss}
              className={`inline-flex rounded-md p-1.5 ${
                variant === 'toast' 
                  ? 'text-red-100 hover:text-white hover:bg-red-700' 
                  : 'text-red-500 hover:text-red-700 hover:bg-red-100'
              }`}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
