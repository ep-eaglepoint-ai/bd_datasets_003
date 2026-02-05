interface IngredientSelectorProps {
  ingredients: string[];
  selectedIngredients: string[];
  onToggle: (ingredient: string) => void;
}

export default function IngredientSelector({
  ingredients,
  selectedIngredients,
  onToggle,
}: IngredientSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="ingredient-selector">
      {ingredients.map((ingredient) => {
        const isSelected = selectedIngredients.includes(ingredient);
        return (
          <button
            key={ingredient}
            onClick={() => onToggle(ingredient)}
            className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-green-500 text-white border-2 border-green-600'
                : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-gray-200'
            }`}
            data-testid={`ingredient-${ingredient.toLowerCase().replace(' ', '-')}`}
            aria-pressed={isSelected}
          >
            {ingredient}
          </button>
        );
      })}
    </div>
  );
}
