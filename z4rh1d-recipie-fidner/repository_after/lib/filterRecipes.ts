import { Recipe, FilterMode } from './types';

export function filterRecipes(
  recipes: Recipe[],
  selectedIngredients: string[],
  mode: FilterMode
): Recipe[] {
  if (selectedIngredients.length === 0) {
    return [];
  }

  return recipes.filter((recipe) => {
    if (mode === 'any') {
      return recipe.ingredients.some((ingredient) =>
        selectedIngredients.includes(ingredient)
      );
    } else {
      return recipe.ingredients.every((ingredient) =>
        selectedIngredients.includes(ingredient)
      );
    }
  });
}
