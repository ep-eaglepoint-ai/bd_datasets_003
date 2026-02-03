import React from 'react';

interface Props {
  steps: Array<{ id: string; label: string; completed?: boolean; current?: boolean }>;
  className?: string;
}

export const ProgressIndicator: React.FC<Props> = ({ steps, className = '' }) => {
  return (
    <div className={`w-full ${className}`}>
      <nav aria-label="Progress">
        <ol role="list" className="flex items-center justify-between">
          {steps.map((step, stepIdx) => (
            <li key={step.id} className={`flex-1 ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`
                    h-10 w-10 flex items-center justify-center rounded-full border-2
                    ${step.completed 
                      ? 'bg-green-600 border-green-600' 
                      : step.current 
                        ? 'border-blue-600 bg-white'
                        : 'border-gray-300 bg-white'
                    }
                  `}>
                    {step.completed ? (
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-sm font-medium ${
                        step.current ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {stepIdx + 1}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-4 min-w-0 flex-1">
                  <p className={`text-sm font-medium ${
                    step.completed 
                      ? 'text-green-600' 
                      : step.current 
                        ? 'text-blue-600'
                        : 'text-gray-500'
                  }`}>
                    {step.label}
                  </p>
                </div>
              </div>
              {stepIdx !== steps.length - 1 && (
                <div className="absolute top-5 left-8 sm:left-20 h-0.5 w-full bg-gray-300" aria-hidden="true">
                  {steps[stepIdx + 1].completed && (
                    <div className="h-0.5 w-full bg-green-600" />
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};

interface LinearProgressProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  showLabel?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

export const LinearProgress: React.FC<LinearProgressProps> = ({
  value,
  max = 100,
  className = '',
  showLabel = false,
  color = 'primary'
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  const colorClasses = {
    primary: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600'
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progress</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${colorClasses[color]} h-2 rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
