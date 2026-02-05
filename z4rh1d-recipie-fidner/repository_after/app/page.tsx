'use client';

import { useState } from 'react';
import { recipes, availableIngredients } from '@/lib/recipes';
import { filterRecipes } from '@/lib/filterRecipes';
import { FilterMode } from '@/lib/types';
import IngredientSelector from '@/components/IngredientSelector';
import RecipeGrid from '@/components/RecipeGrid';
import FilterModeToggle from '@/components/FilterModeToggle';

export default function Home() {
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('any');

  const toggleIngredient = (ingredient: string) => {
    setSelectedIngredients((prev) =>
      prev.includes(ingredient)
        ? prev.filter((i) => i !== ingredient)
        : [...prev, ingredient]
    );
  };

  const filteredRecipes = filterRecipes(recipes, selectedIngredients, filterMode);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
            Recipe Finder
          </h1>
          <p className="text-gray-600">
            Select ingredients you have and discover what you can cook!
          </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-1/4">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Available Ingredients
              </h2>
              <IngredientSelector
                ingredients={availableIngredients}
                selectedIngredients={selectedIngredients}
                onToggle={toggleIngredient}
              />
              <div className="mt-6 pt-4 border-t border-gray-200">
                <FilterModeToggle mode={filterMode} onModeChange={setFilterMode} />
              </div>
              {selectedIngredients.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Selected: {selectedIngredients.length} ingredient
                    {selectedIngredients.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={() => setSelectedIngredients([])}
                    className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                    data-testid="clear-selection"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          </aside>

          <section className="lg:w-3/4">
            <RecipeGrid
              recipes={filteredRecipes}
              hasSelection={selectedIngredients.length > 0}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
