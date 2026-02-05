import { Recipe } from '@/lib/types';
import RecipeCard from './RecipeCard';

interface RecipeGridProps {
  recipes: Recipe[];
  hasSelection: boolean;
}

export default function RecipeGrid({ recipes, hasSelection }: RecipeGridProps) {
  if (!hasSelection) {
    return (
      <div
        className="text-center py-12 bg-white rounded-lg shadow-md"
        data-testid="no-selection-message"
      >
        <p className="text-gray-500 text-lg">
          Select ingredients to find recipes
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Choose from the ingredients on the left to get started
        </p>
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div
        className="text-center py-12 bg-white rounded-lg shadow-md"
        data-testid="no-recipes-message"
      >
        <p className="text-gray-500 text-lg">No recipes found</p>
        <p className="text-gray-400 text-sm mt-2">
          Try selecting different ingredients
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      data-testid="recipe-grid"
    >
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}
