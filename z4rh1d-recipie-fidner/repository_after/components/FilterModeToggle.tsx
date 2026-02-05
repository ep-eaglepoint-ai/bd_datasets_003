import { FilterMode } from '@/lib/types';

interface FilterModeToggleProps {
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
}

export default function FilterModeToggle({
  mode,
  onModeChange,
}: FilterModeToggleProps) {
  return (
    <div data-testid="filter-mode-toggle">
      <p className="text-sm font-medium text-gray-700 mb-2">Filter Mode:</p>
      <div className="flex gap-2">
        <button
          onClick={() => onModeChange('any')}
          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
            mode === 'any'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          data-testid="filter-mode-any"
        >
          Any Match
        </button>
        <button
          onClick={() => onModeChange('all')}
          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
            mode === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          data-testid="filter-mode-all"
        >
          All Match
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {mode === 'any'
          ? 'Shows recipes with at least one selected ingredient'
          : 'Shows recipes where you have all required ingredients'}
      </p>
    </div>
  );
}
