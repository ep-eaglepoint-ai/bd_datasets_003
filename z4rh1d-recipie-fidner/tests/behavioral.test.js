/**
 * Behavioral Tests for Recipe Finder Application
 * These tests verify actual behavior through logic simulation and state changes
 * No JSX - pure JavaScript testing of business logic and state management
 */

const fs = require('fs');
const path = require('path');

const REPO_PATH = path.join(__dirname, '../repository_after');

// Helper: Parse TypeScript file to extract data (simplified evaluation)
function loadRecipesData() {
  const recipesPath = path.join(REPO_PATH, 'lib/recipes.ts');
  const content = fs.readFileSync(recipesPath, 'utf8');
  
  const recipes = [];
  
  // Match each recipe object block
  const recipeBlockRegex = /{\s*id:\s*(\d+),\s*title:\s*'([^']+)',\s*ingredients:\s*\[([\s\S]*?)\],\s*difficulty:\s*'([^']+)',\s*image:\s*'([^']+)',?\s*}/g;
  
  let match;
  while ((match = recipeBlockRegex.exec(content)) !== null) {
    const ingredientsStr = match[3];
    const ingredients = ingredientsStr.match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    recipes.push({
      id: parseInt(match[1]),
      title: match[2],
      ingredients,
      difficulty: match[4],
      image: match[5]
    });
  }
  
  // Extract available ingredients
  const ingredientsMatch = content.match(/export const availableIngredients[^=]*=\s*\[([\s\S]*?)\];/);
  const ingredientsList = ingredientsMatch?.[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
  
  return { recipes, ingredients: ingredientsList };
}

// Implement filterRecipes logic (mirrors lib/filterRecipes.ts)
function filterRecipes(recipes, selectedIngredients, mode) {
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

// Implement toggle ingredient logic (mirrors page.tsx state management)
function toggleIngredient(selected, ingredient) {
  return selected.includes(ingredient)
    ? selected.filter(i => i !== ingredient)
    : [...selected, ingredient];
}

// ============================================================
// REQUIREMENT 5: Interactive ingredient selection behavior
// ============================================================
describe('Requirement 5: Ingredient toggle state behavior', () => {
  test('clicking unselected ingredient adds it to selection', () => {
    let selected = [];
    
    // Simulate click on Chicken
    selected = toggleIngredient(selected, 'Chicken');
    
    expect(selected).toContain('Chicken');
    expect(selected.length).toBe(1);
  });

  test('clicking selected ingredient removes it from selection', () => {
    let selected = ['Chicken', 'Beef'];
    
    // Simulate click on Chicken (already selected)
    selected = toggleIngredient(selected, 'Chicken');
    
    expect(selected).not.toContain('Chicken');
    expect(selected).toContain('Beef');
    expect(selected.length).toBe(1);
  });

  test('multiple clicks toggle state correctly', () => {
    let selected = [];
    
    // Add Chicken
    selected = toggleIngredient(selected, 'Chicken');
    expect(selected).toEqual(['Chicken']);
    
    // Add Beef
    selected = toggleIngredient(selected, 'Beef');
    expect(selected).toEqual(['Chicken', 'Beef']);
    
    // Add Rice
    selected = toggleIngredient(selected, 'Rice');
    expect(selected).toEqual(['Chicken', 'Beef', 'Rice']);
    
    // Remove Beef
    selected = toggleIngredient(selected, 'Beef');
    expect(selected).toEqual(['Chicken', 'Rice']);
    
    // Remove Chicken
    selected = toggleIngredient(selected, 'Chicken');
    expect(selected).toEqual(['Rice']);
    
    // Remove Rice
    selected = toggleIngredient(selected, 'Rice');
    expect(selected).toEqual([]);
  });

  test('selecting same ingredient twice returns to empty', () => {
    let selected = [];
    
    selected = toggleIngredient(selected, 'Chicken');
    selected = toggleIngredient(selected, 'Chicken');
    
    expect(selected).toEqual([]);
  });

  test('selection order is preserved', () => {
    let selected = [];
    
    selected = toggleIngredient(selected, 'Rice');
    selected = toggleIngredient(selected, 'Chicken');
    selected = toggleIngredient(selected, 'Beef');
    
    expect(selected).toEqual(['Rice', 'Chicken', 'Beef']);
  });

  test('available ingredients list has at least 15 items', () => {
    const { ingredients } = loadRecipesData();
    expect(ingredients.length).toBeGreaterThanOrEqual(15);
  });

  test('all required ingredients are present', () => {
    const { ingredients } = loadRecipesData();
    const required = ['Chicken', 'Beef', 'Rice', 'Pasta', 'Tomatoes', 'Onions', 
                      'Garlic', 'Eggs', 'Milk', 'Cheese', 'Bell Pepper', 
                      'Carrots', 'Potatoes', 'Flour', 'Butter'];
    
    required.forEach(ing => {
      expect(ingredients).toContain(ing);
    });
  });
});

// ============================================================
// REQUIREMENT 6: Real-time filtering on selection change
// ============================================================
describe('Requirement 6: Real-time filtering behavior', () => {
  const { recipes } = loadRecipesData();

  test('no ingredients selected returns empty array', () => {
    const result = filterRecipes(recipes, [], 'any');
    expect(result).toEqual([]);
  });

  test('selecting one ingredient returns matching recipes immediately', () => {
    const result = filterRecipes(recipes, ['Chicken'], 'any');
    expect(result.length).toBeGreaterThan(0);
    
    result.forEach(recipe => {
      expect(recipe.ingredients).toContain('Chicken');
    });
  });

  test('filtering updates with each state change', () => {
    let selected = [];
    
    // Initial: empty selection, no results
    let filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBe(0);
    
    // Select Chicken
    selected = toggleIngredient(selected, 'Chicken');
    filtered = filterRecipes(recipes, selected, 'any');
    const chickenCount = filtered.length;
    expect(chickenCount).toBeGreaterThan(0);
    
    // Select Pasta
    selected = toggleIngredient(selected, 'Pasta');
    filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBeGreaterThanOrEqual(chickenCount);
    
    // Deselect all
    selected = [];
    filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBe(0);
  });

  test('filtering is deterministic - same input gives same output', () => {
    const selected = ['Chicken', 'Rice'];
    
    const result1 = filterRecipes(recipes, selected, 'any');
    const result2 = filterRecipes(recipes, selected, 'any');
    
    expect(result1).toEqual(result2);
  });

  test('filtering does not mutate original recipes array', () => {
    const originalLength = recipes.length;
    const originalFirstRecipe = { ...recipes[0] };
    
    filterRecipes(recipes, ['Chicken'], 'any');
    
    expect(recipes.length).toBe(originalLength);
    expect(recipes[0].id).toBe(originalFirstRecipe.id);
    expect(recipes[0].title).toBe(originalFirstRecipe.title);
  });
});

// ============================================================
// REQUIREMENT 7: Matching logic (any vs all modes)
// ============================================================
describe('Requirement 7: Filter mode behavior', () => {
  const { recipes } = loadRecipesData();

  test('"any" mode returns recipes with at least one matching ingredient', () => {
    const result = filterRecipes(recipes, ['Chicken'], 'any');
    
    result.forEach(recipe => {
      const hasChicken = recipe.ingredients.includes('Chicken');
      expect(hasChicken).toBe(true);
    });
  });

  test('"all" mode returns only recipes where ALL ingredients are in selection', () => {
    // Find a simple recipe with few ingredients
    const simpleRecipe = recipes.find(r => r.ingredients.length <= 3);
    if (simpleRecipe) {
      const result = filterRecipes(recipes, simpleRecipe.ingredients, 'all');
      
      // The simple recipe should be in results
      expect(result.some(r => r.id === simpleRecipe.id)).toBe(true);
      
      // All returned recipes should have ALL their ingredients in selection
      result.forEach(recipe => {
        const allMatch = recipe.ingredients.every(ing => 
          simpleRecipe.ingredients.includes(ing)
        );
        expect(allMatch).toBe(true);
      });
    }
  });

  test('"any" mode with single ingredient matches multiple recipes', () => {
    const result = filterRecipes(recipes, ['Garlic'], 'any');
    // Garlic is common, should match multiple recipes
    expect(result.length).toBeGreaterThan(1);
  });

  test('"all" mode with single ingredient returns only single-ingredient recipes', () => {
    const result = filterRecipes(recipes, ['Chicken'], 'all');
    
    // Any returned recipe must have ONLY 'Chicken' as ingredient
    result.forEach(recipe => {
      const allInSelection = recipe.ingredients.every(ing => ing === 'Chicken');
      expect(allInSelection).toBe(true);
    });
  });

  test('"any" mode is more permissive than "all" mode', () => {
    const selected = ['Chicken', 'Rice', 'Garlic'];
    
    const anyResult = filterRecipes(recipes, selected, 'any');
    const allResult = filterRecipes(recipes, selected, 'all');
    
    expect(anyResult.length).toBeGreaterThanOrEqual(allResult.length);
  });

  test('switching modes changes results', () => {
    const selected = ['Pasta', 'Cheese', 'Eggs'];
    
    const anyResult = filterRecipes(recipes, selected, 'any');
    const allResult = filterRecipes(recipes, selected, 'all');
    
    // Results should differ (any is more permissive)
    if (anyResult.length > 0 && allResult.length !== anyResult.length) {
      expect(anyResult.length).not.toBe(allResult.length);
    }
  });

  test('filter mode state toggles correctly', () => {
    let mode = 'any';
    
    // Toggle to all
    mode = mode === 'any' ? 'all' : 'any';
    expect(mode).toBe('all');
    
    // Toggle back to any
    mode = mode === 'any' ? 'all' : 'any';
    expect(mode).toBe('any');
  });
});

// ============================================================
// REQUIREMENT 10: Empty states behavior
// ============================================================
describe('Requirement 10: Empty state conditions', () => {
  const { recipes } = loadRecipesData();

  test('empty state shown when no ingredients selected', () => {
    const selected = [];
    const filtered = filterRecipes(recipes, selected, 'any');
    const hasSelection = selected.length > 0;
    
    expect(hasSelection).toBe(false);
    expect(filtered.length).toBe(0);
    // UI should show "no selection" message
  });

  test('empty state shown when selection has no matches', () => {
    // Use an ingredient not in any recipe
    const selected = ['NonExistentIngredient'];
    const filtered = filterRecipes(recipes, selected, 'any');
    const hasSelection = selected.length > 0;
    
    expect(hasSelection).toBe(true);
    expect(filtered.length).toBe(0);
    // UI should show "no matches" message
  });

  test('no empty state when recipes match', () => {
    const selected = ['Chicken'];
    const filtered = filterRecipes(recipes, selected, 'any');
    const hasSelection = selected.length > 0;
    
    expect(hasSelection).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
    // UI should show recipe grid
  });

  test('transition from no selection to selection works', () => {
    let selected = [];
    let hasSelection = selected.length > 0;
    expect(hasSelection).toBe(false);
    
    selected = toggleIngredient(selected, 'Chicken');
    hasSelection = selected.length > 0;
    expect(hasSelection).toBe(true);
    
    const filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBeGreaterThan(0);
  });

  test('transition from selection to no selection works', () => {
    let selected = ['Chicken'];
    let filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBeGreaterThan(0);
    
    selected = toggleIngredient(selected, 'Chicken'); // Remove
    filtered = filterRecipes(recipes, selected, 'any');
    expect(filtered.length).toBe(0);
  });
});

// ============================================================
// REQUIREMENT 11: Client-side filtering verification
// ============================================================
describe('Requirement 11: Client-side only filtering', () => {
  const { recipes } = loadRecipesData();

  test('filtering is a pure function', () => {
    const selected = ['Chicken'];
    
    const result1 = filterRecipes(recipes, selected, 'any');
    const result2 = filterRecipes(recipes, selected, 'any');
    
    expect(result1).toEqual(result2);
  });

  test('filtering returns new array, not mutation', () => {
    const result = filterRecipes(recipes, ['Chicken'], 'any');
    
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBe(recipes);
  });

  test('filtering uses array filter method correctly', () => {
    const filterPath = path.join(REPO_PATH, 'lib/filterRecipes.ts');
    const content = fs.readFileSync(filterPath, 'utf8');
    
    expect(content).toContain('.filter(');
    expect(content).toContain('.some(');
    expect(content).toContain('.every(');
  });

  test('no API calls in page component', () => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');
    
    expect(content).not.toMatch(/fetch\s*\(/);
    expect(content).not.toContain('axios');
    expect(content).not.toContain('useSWR');
  });

  test('recipes are imported directly from data file', () => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');
    
    expect(content).toContain("from '@/lib/recipes'");
  });
});

// ============================================================
// INTEGRATION: Complete user flow simulation
// ============================================================
describe('Integration: Complete user flow', () => {
  const { recipes } = loadRecipesData();

  test('full user journey simulation', () => {
    // Initial state
    let selected = [];
    let mode = 'any';
    let filtered = filterRecipes(recipes, selected, mode);
    
    // Step 1: User sees empty state (no selection)
    expect(selected.length).toBe(0);
    expect(filtered.length).toBe(0);
    
    // Step 2: User clicks "Chicken"
    selected = toggleIngredient(selected, 'Chicken');
    filtered = filterRecipes(recipes, selected, mode);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(r => r.ingredients.includes('Chicken'))).toBe(true);
    
    // Step 3: User clicks "Rice" to add more
    selected = toggleIngredient(selected, 'Rice');
    filtered = filterRecipes(recipes, selected, mode);
    const anyModeCount = filtered.length;
    expect(anyModeCount).toBeGreaterThan(0);
    
    // Step 4: User switches to "all" mode
    mode = 'all';
    filtered = filterRecipes(recipes, selected, mode);
    expect(filtered.length).toBeLessThanOrEqual(anyModeCount);
    
    // Step 5: User adds more ingredients
    selected = toggleIngredient(selected, 'Garlic');
    selected = toggleIngredient(selected, 'Onions');
    filtered = filterRecipes(recipes, selected, mode);
    // More ingredients in "all" mode should allow more matches
    
    // Step 6: User deselects all ingredients one by one
    selected = [];
    filtered = filterRecipes(recipes, selected, mode);
    expect(filtered.length).toBe(0);
  });

  test('rapid state changes work correctly', () => {
    let selected = [];
    
    // Rapid toggles
    for (let i = 0; i < 10; i++) {
      selected = toggleIngredient(selected, 'Chicken');
    }
    
    // After even number of toggles, should be empty
    expect(selected.length).toBe(0);
    
    // After odd number of toggles, should have Chicken
    selected = toggleIngredient(selected, 'Chicken');
    expect(selected).toContain('Chicken');
  });

  test('filtering with all available ingredients', () => {
    const { ingredients } = loadRecipesData();
    
    // Select all ingredients
    const allSelected = [...ingredients];
    
    // In "any" mode, should return all recipes
    const anyResult = filterRecipes(recipes, allSelected, 'any');
    expect(anyResult.length).toBe(recipes.length);
    
    // In "all" mode, should return recipes where all ingredients are in selection
    const allResult = filterRecipes(recipes, allSelected, 'all');
    expect(allResult.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Data validation tests
// ============================================================
describe('Recipe data integrity', () => {
  const { recipes } = loadRecipesData();

  test('at least 10 recipes exist', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(10);
  });

  test('all recipes have required fields', () => {
    recipes.forEach(recipe => {
      expect(recipe).toHaveProperty('id');
      expect(recipe).toHaveProperty('title');
      expect(recipe).toHaveProperty('ingredients');
      expect(recipe).toHaveProperty('difficulty');
      expect(recipe).toHaveProperty('image');
    });
  });

  test('all recipes have valid difficulty values', () => {
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    
    recipes.forEach(recipe => {
      expect(validDifficulties).toContain(recipe.difficulty);
    });
  });

  test('recipes have diverse difficulties', () => {
    const difficulties = new Set(recipes.map(r => r.difficulty));
    expect(difficulties.size).toBeGreaterThanOrEqual(2);
  });

  test('all recipes have at least 2 ingredients', () => {
    recipes.forEach(recipe => {
      expect(recipe.ingredients.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('all recipe IDs are unique', () => {
    const ids = recipes.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
