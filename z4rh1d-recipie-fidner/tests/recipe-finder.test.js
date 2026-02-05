/**
 * Comprehensive Tests for Recipe Finder Application
 * Tests all 11 requirements from the specification
 */

const fs = require('fs');
const path = require('path');

const REPO_PATH = path.join(__dirname, '../repository_after');

// ============================================================
// REQUIREMENT 1: Next.js with App Router, TypeScript, Tailwind CSS
// ============================================================
describe('Requirement 1: Next.js with App Router, TypeScript, Tailwind CSS', () => {
  test('package.json exists and has Next.js dependency', () => {
    const packageJsonPath = path.join(REPO_PATH, 'package.json');
    expect(fs.existsSync(packageJsonPath)).toBe(true);
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(packageJson.dependencies).toHaveProperty('next');
  });

  test('package.json has React dependencies', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_PATH, 'package.json'), 'utf8'));
    expect(packageJson.dependencies).toHaveProperty('react');
    expect(packageJson.dependencies).toHaveProperty('react-dom');
  });

  test('tsconfig.json exists with strict type checking enabled', () => {
    const tsconfigPath = path.join(REPO_PATH, 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  test('tailwind.config.ts exists', () => {
    const tailwindConfigPath = path.join(REPO_PATH, 'tailwind.config.ts');
    expect(fs.existsSync(tailwindConfigPath)).toBe(true);
  });

  test('postcss.config.js exists with tailwindcss plugin', () => {
    const postcssPath = path.join(REPO_PATH, 'postcss.config.js');
    expect(fs.existsSync(postcssPath)).toBe(true);
    
    const content = fs.readFileSync(postcssPath, 'utf8');
    expect(content).toContain('tailwindcss');
  });

  test('app directory exists (App Router structure)', () => {
    const appDirPath = path.join(REPO_PATH, 'app');
    expect(fs.existsSync(appDirPath)).toBe(true);
    expect(fs.statSync(appDirPath).isDirectory()).toBe(true);
  });

  test('app/layout.tsx exists', () => {
    const layoutPath = path.join(REPO_PATH, 'app/layout.tsx');
    expect(fs.existsSync(layoutPath)).toBe(true);
  });

  test('app/page.tsx exists', () => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  test('globals.css uses Tailwind directives', () => {
    const globalsCssPath = path.join(REPO_PATH, 'app/globals.css');
    expect(fs.existsSync(globalsCssPath)).toBe(true);
    
    const content = fs.readFileSync(globalsCssPath, 'utf8');
    expect(content).toContain('@tailwind base');
    expect(content).toContain('@tailwind components');
    expect(content).toContain('@tailwind utilities');
  });
});

// ============================================================
// REQUIREMENT 2: Data file with at least 10 diverse recipes
// ============================================================
describe('Requirement 2: Data file with at least 10 diverse recipes', () => {
  let recipesModule;
  
  beforeAll(() => {
    const recipesPath = path.join(REPO_PATH, 'lib/recipes.ts');
    expect(fs.existsSync(recipesPath)).toBe(true);
    recipesModule = fs.readFileSync(recipesPath, 'utf8');
  });

  test('lib/recipes.ts file exists', () => {
    const recipesPath = path.join(REPO_PATH, 'lib/recipes.ts');
    expect(fs.existsSync(recipesPath)).toBe(true);
  });

  test('recipes array is exported', () => {
    expect(recipesModule).toContain('export const recipes');
  });

  test('contains at least 10 recipes', () => {
    const recipeMatches = recipesModule.match(/{\s*id:/g);
    expect(recipeMatches).not.toBeNull();
    expect(recipeMatches.length).toBeGreaterThanOrEqual(10);
  });

  test('recipes have diverse difficulties (Easy, Medium, Hard)', () => {
    expect(recipesModule).toContain("difficulty: 'Easy'");
    expect(recipesModule).toContain("difficulty: 'Medium'");
    expect(recipesModule).toContain("difficulty: 'Hard'");
  });

  test('recipes represent different meal types/cuisines', () => {
    const titles = recipesModule.match(/title:\s*'[^']+'/g);
    expect(titles).not.toBeNull();
    expect(titles.length).toBeGreaterThanOrEqual(10);
    
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================
// REQUIREMENT 3: Recipe interface with required properties
// ============================================================
describe('Requirement 3: Recipe TypeScript interface', () => {
  let typesModule;
  
  beforeAll(() => {
    const typesPath = path.join(REPO_PATH, 'lib/types.ts');
    expect(fs.existsSync(typesPath)).toBe(true);
    typesModule = fs.readFileSync(typesPath, 'utf8');
  });

  test('lib/types.ts file exists', () => {
    const typesPath = path.join(REPO_PATH, 'lib/types.ts');
    expect(fs.existsSync(typesPath)).toBe(true);
  });

  test('Recipe interface is defined', () => {
    expect(typesModule).toContain('interface Recipe');
  });

  test('Recipe interface has id property (string or number)', () => {
    expect(typesModule).toMatch(/id\s*:\s*(string|number|string\s*\|\s*number)/);
  });

  test('Recipe interface has title property (string)', () => {
    expect(typesModule).toMatch(/title\s*:\s*string/);
  });

  test('Recipe interface has ingredients property (array of strings)', () => {
    expect(typesModule).toMatch(/ingredients\s*:\s*string\[\]/);
  });

  test('Recipe interface has difficulty property with literal types', () => {
    expect(typesModule).toContain('Difficulty');
    expect(typesModule).toMatch(/['"]Easy['"]/);
    expect(typesModule).toMatch(/['"]Medium['"]/);
    expect(typesModule).toMatch(/['"]Hard['"]/);
  });

  test('Recipe interface has image property (string)', () => {
    expect(typesModule).toMatch(/image\s*:\s*string/);
  });

  test('Difficulty type is properly defined', () => {
    expect(typesModule).toMatch(/type\s+Difficulty\s*=/);
  });
});

// ============================================================
// REQUIREMENT 4: Comprehensive list of at least 15 ingredients
// ============================================================
describe('Requirement 4: At least 15 selectable ingredients', () => {
  let recipesModule;
  
  beforeAll(() => {
    const recipesPath = path.join(REPO_PATH, 'lib/recipes.ts');
    recipesModule = fs.readFileSync(recipesPath, 'utf8');
  });

  test('availableIngredients array is exported', () => {
    expect(recipesModule).toContain('export const availableIngredients');
  });

  test('contains at least 15 ingredients', () => {
    const ingredientMatches = recipesModule.match(/availableIngredients[^;]+/s);
    expect(ingredientMatches).not.toBeNull();
    
    const ingredientList = ingredientMatches[0].match(/'[^']+'/g);
    expect(ingredientList).not.toBeNull();
    expect(ingredientList.length).toBeGreaterThanOrEqual(15);
  });

  test('contains required common ingredients - Chicken', () => {
    expect(recipesModule).toContain("'Chicken'");
  });

  test('contains required common ingredients - Beef', () => {
    expect(recipesModule).toContain("'Beef'");
  });

  test('contains required common ingredients - Rice', () => {
    expect(recipesModule).toContain("'Rice'");
  });

  test('contains required common ingredients - Pasta', () => {
    expect(recipesModule).toContain("'Pasta'");
  });

  test('contains required common ingredients - Tomatoes', () => {
    expect(recipesModule).toContain("'Tomatoes'");
  });

  test('contains required common ingredients - Onions', () => {
    expect(recipesModule).toContain("'Onions'");
  });

  test('contains required common ingredients - Garlic', () => {
    expect(recipesModule).toContain("'Garlic'");
  });

  test('contains required common ingredients - Eggs', () => {
    expect(recipesModule).toContain("'Eggs'");
  });

  test('contains required common ingredients - Milk', () => {
    expect(recipesModule).toContain("'Milk'");
  });

  test('contains required common ingredients - Cheese', () => {
    expect(recipesModule).toContain("'Cheese'");
  });

  test('contains required common ingredients - Bell Pepper', () => {
    expect(recipesModule).toContain("'Bell Pepper'");
  });

  test('contains required common ingredients - Carrots', () => {
    expect(recipesModule).toContain("'Carrots'");
  });

  test('contains required common ingredients - Potatoes', () => {
    expect(recipesModule).toContain("'Potatoes'");
  });

  test('contains required common ingredients - Flour', () => {
    expect(recipesModule).toContain("'Flour'");
  });

  test('contains required common ingredients - Butter', () => {
    expect(recipesModule).toContain("'Butter'");
  });
});

// ============================================================
// REQUIREMENT 5: Interactive filter controls (ingredient selection)
// ============================================================
describe('Requirement 5: Interactive ingredient filter controls', () => {
  let ingredientSelectorContent;
  let pageContent;
  
  beforeAll(() => {
    const selectorPath = path.join(REPO_PATH, 'components/IngredientSelector.tsx');
    expect(fs.existsSync(selectorPath)).toBe(true);
    ingredientSelectorContent = fs.readFileSync(selectorPath, 'utf8');
    
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    pageContent = fs.readFileSync(pagePath, 'utf8');
  });

  test('IngredientSelector component exists', () => {
    const selectorPath = path.join(REPO_PATH, 'components/IngredientSelector.tsx');
    expect(fs.existsSync(selectorPath)).toBe(true);
  });

  test('IngredientSelector renders clickable buttons or checkboxes', () => {
    expect(ingredientSelectorContent).toMatch(/<button|<input.*type.*checkbox/);
  });

  test('IngredientSelector has onClick handler for toggling', () => {
    expect(ingredientSelectorContent).toContain('onClick');
  });

  test('IngredientSelector shows visual difference for selected state', () => {
    expect(ingredientSelectorContent).toContain('isSelected');
    expect(ingredientSelectorContent).toMatch(/bg-green|bg-blue|border|active/);
  });

  test('IngredientSelector receives ingredients prop', () => {
    expect(ingredientSelectorContent).toContain('ingredients');
  });

  test('IngredientSelector receives selectedIngredients prop', () => {
    expect(ingredientSelectorContent).toContain('selectedIngredients');
  });

  test('IngredientSelector receives onToggle callback prop', () => {
    expect(ingredientSelectorContent).toContain('onToggle');
  });

  test('Main page uses useState for selectedIngredients', () => {
    expect(pageContent).toContain('useState');
    expect(pageContent).toContain('selectedIngredients');
    expect(pageContent).toContain('setSelectedIngredients');
  });

  test('Main page has toggleIngredient function', () => {
    expect(pageContent).toContain('toggleIngredient');
  });

  test('Toggle function adds ingredient when not selected', () => {
    expect(pageContent).toMatch(/\[\.\.\.prev,\s*ingredient\]|prev\.concat|push/);
  });

  test('Toggle function removes ingredient when already selected', () => {
    expect(pageContent).toContain('filter');
  });

  test('Ingredients have data-testid attributes for testing', () => {
    expect(ingredientSelectorContent).toContain('data-testid');
  });
});

// ============================================================
// REQUIREMENT 6: Real-time filtering on selection change
// ============================================================
describe('Requirement 6: Real-time filtering on selection change', () => {
  let pageContent;
  let filterRecipesContent;
  
  beforeAll(() => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    pageContent = fs.readFileSync(pagePath, 'utf8');
    
    const filterPath = path.join(REPO_PATH, 'lib/filterRecipes.ts');
    expect(fs.existsSync(filterPath)).toBe(true);
    filterRecipesContent = fs.readFileSync(filterPath, 'utf8');
  });

  test('filterRecipes function exists in lib/filterRecipes.ts', () => {
    const filterPath = path.join(REPO_PATH, 'lib/filterRecipes.ts');
    expect(fs.existsSync(filterPath)).toBe(true);
  });

  test('filterRecipes function is exported', () => {
    expect(filterRecipesContent).toContain('export function filterRecipes');
  });

  test('Main page imports filterRecipes', () => {
    expect(pageContent).toContain('filterRecipes');
    expect(pageContent).toContain("from '@/lib/filterRecipes'");
  });

  test('Filtering is called reactively (not on button click)', () => {
    expect(pageContent).toContain('filterRecipes(recipes, selectedIngredients');
    expect(pageContent).not.toMatch(/onClick.*filterRecipes|onSubmit.*filterRecipes/);
  });

  test('Filtered recipes are derived from state', () => {
    expect(pageContent).toMatch(/const\s+filteredRecipes\s*=\s*filterRecipes/);
  });

  test('No page reload required for filtering', () => {
    expect(pageContent).not.toContain('window.location.reload');
    expect(pageContent).not.toContain('router.refresh');
  });

  test('Page is a client component for interactivity', () => {
    expect(pageContent).toContain("'use client'");
  });
});

// ============================================================
// REQUIREMENT 7: Matching logic (any or all ingredients)
// ============================================================
describe('Requirement 7: Matching logic implementation', () => {
  let filterRecipesContent;
  let pageContent;
  
  beforeAll(() => {
    const filterPath = path.join(REPO_PATH, 'lib/filterRecipes.ts');
    filterRecipesContent = fs.readFileSync(filterPath, 'utf8');
    
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    pageContent = fs.readFileSync(pagePath, 'utf8');
  });

  test('filterRecipes accepts mode parameter', () => {
    expect(filterRecipesContent).toMatch(/mode\s*:\s*FilterMode|mode\s*:\s*['"]any['"]|['"]all['"]/);
  });

  test('filterRecipes implements "any" match logic using some()', () => {
    expect(filterRecipesContent).toContain('.some(');
  });

  test('filterRecipes implements "all" match logic using every()', () => {
    expect(filterRecipesContent).toContain('.every(');
  });

  test('FilterMode type is defined', () => {
    const typesPath = path.join(REPO_PATH, 'lib/types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    expect(typesContent).toContain('FilterMode');
  });

  test('Main page has filterMode state', () => {
    expect(pageContent).toContain('filterMode');
    expect(pageContent).toContain('setFilterMode');
  });

  test('FilterModeToggle component exists', () => {
    const togglePath = path.join(REPO_PATH, 'components/FilterModeToggle.tsx');
    expect(fs.existsSync(togglePath)).toBe(true);
  });

  test('FilterModeToggle allows switching between modes', () => {
    const togglePath = path.join(REPO_PATH, 'components/FilterModeToggle.tsx');
    const toggleContent = fs.readFileSync(togglePath, 'utf8');
    expect(toggleContent).toContain("'any'");
    expect(toggleContent).toContain("'all'");
  });

  test('Filter uses array filter method', () => {
    expect(filterRecipesContent).toContain('.filter(');
  });

  test('Filter returns empty array when no ingredients selected', () => {
    expect(filterRecipesContent).toMatch(/selectedIngredients\.length\s*===\s*0|!selectedIngredients\.length/);
    expect(filterRecipesContent).toContain('return []');
  });
});

// ============================================================
// REQUIREMENT 8: Responsive grid layout
// ============================================================
describe('Requirement 8: Responsive grid layout', () => {
  let recipeGridContent;
  
  beforeAll(() => {
    const gridPath = path.join(REPO_PATH, 'components/RecipeGrid.tsx');
    expect(fs.existsSync(gridPath)).toBe(true);
    recipeGridContent = fs.readFileSync(gridPath, 'utf8');
  });

  test('RecipeGrid component exists', () => {
    const gridPath = path.join(REPO_PATH, 'components/RecipeGrid.tsx');
    expect(fs.existsSync(gridPath)).toBe(true);
  });

  test('RecipeCard component exists', () => {
    const cardPath = path.join(REPO_PATH, 'components/RecipeCard.tsx');
    expect(fs.existsSync(cardPath)).toBe(true);
  });

  test('Uses CSS grid layout', () => {
    expect(recipeGridContent).toContain('grid');
  });

  test('Has single column on mobile (grid-cols-1)', () => {
    expect(recipeGridContent).toContain('grid-cols-1');
  });

  test('Has multiple columns on tablet (md:grid-cols)', () => {
    expect(recipeGridContent).toMatch(/md:grid-cols-[2-3]/);
  });

  test('Has multiple columns on desktop (lg:grid-cols)', () => {
    expect(recipeGridContent).toMatch(/lg:grid-cols-[3-4]/);
  });

  test('RecipeCard displays recipe title', () => {
    const cardPath = path.join(REPO_PATH, 'components/RecipeCard.tsx');
    const cardContent = fs.readFileSync(cardPath, 'utf8');
    expect(cardContent).toContain('recipe.title');
  });

  test('RecipeCard displays recipe image', () => {
    const cardPath = path.join(REPO_PATH, 'components/RecipeCard.tsx');
    const cardContent = fs.readFileSync(cardPath, 'utf8');
    expect(cardContent).toContain('recipe.image');
    expect(cardContent).toMatch(/<img|Image/);
  });

  test('RecipeGrid maps over recipes array', () => {
    expect(recipeGridContent).toContain('recipes.map');
  });
});

// ============================================================
// REQUIREMENT 9: Color-coded difficulty badges
// ============================================================
describe('Requirement 9: Color-coded difficulty badges', () => {
  let recipeCardContent;
  
  beforeAll(() => {
    const cardPath = path.join(REPO_PATH, 'components/RecipeCard.tsx');
    expect(fs.existsSync(cardPath)).toBe(true);
    recipeCardContent = fs.readFileSync(cardPath, 'utf8');
  });

  test('RecipeCard displays difficulty badge', () => {
    expect(recipeCardContent).toContain('recipe.difficulty');
  });

  test('Difficulty badge has data-testid for testing', () => {
    expect(recipeCardContent).toContain('data-testid="difficulty-badge"');
  });

  test('Easy difficulty has green color', () => {
    expect(recipeCardContent).toMatch(/Easy.*green|green.*Easy/s);
  });

  test('Medium difficulty has yellow/orange color', () => {
    expect(recipeCardContent).toMatch(/Medium.*yellow|yellow.*Medium|Medium.*orange|orange.*Medium/s);
  });

  test('Hard difficulty has red color', () => {
    expect(recipeCardContent).toMatch(/Hard.*red|red.*Hard/s);
  });

  test('Difficulty colors are mapped in an object or switch', () => {
    expect(recipeCardContent).toMatch(/difficultyColors|switch|difficulty\s*===|difficulty\s*==/);
  });

  test('Badge has appropriate styling classes', () => {
    expect(recipeCardContent).toMatch(/rounded|badge|pill|px-|py-/);
  });

  test('Badge text is readable (white text on colored background)', () => {
    expect(recipeCardContent).toContain('text-white');
  });
});

// ============================================================
// REQUIREMENT 10: Empty states for two scenarios
// ============================================================
describe('Requirement 10: Empty states', () => {
  let recipeGridContent;
  
  beforeAll(() => {
    const gridPath = path.join(REPO_PATH, 'components/RecipeGrid.tsx');
    recipeGridContent = fs.readFileSync(gridPath, 'utf8');
  });

  test('RecipeGrid receives hasSelection prop', () => {
    expect(recipeGridContent).toContain('hasSelection');
  });

  test('Shows message when no ingredients selected', () => {
    expect(recipeGridContent).toContain('no-selection-message');
    expect(recipeGridContent).toMatch(/Select ingredients|select ingredients/i);
  });

  test('Shows message when no recipes match', () => {
    expect(recipeGridContent).toContain('no-recipes-message');
    expect(recipeGridContent).toMatch(/No recipes found|no recipes/i);
  });

  test('No selection message has helpful prompt', () => {
    expect(recipeGridContent).toMatch(/Select ingredients to find recipes|choose.*ingredients/i);
  });

  test('No matches message suggests trying different ingredients', () => {
    expect(recipeGridContent).toMatch(/different ingredients|try selecting/i);
  });

  test('Empty states have data-testid for testing', () => {
    expect(recipeGridContent).toContain('data-testid="no-selection-message"');
    expect(recipeGridContent).toContain('data-testid="no-recipes-message"');
  });

  test('Checks for no selection state first', () => {
    expect(recipeGridContent).toMatch(/if\s*\(\s*!hasSelection\s*\)|hasSelection.*false/);
  });

  test('Checks for empty results after filtering', () => {
    expect(recipeGridContent).toMatch(/recipes\.length\s*===\s*0|!recipes\.length/);
  });
});

// ============================================================
// REQUIREMENT 11: Client-side filtering only
// ============================================================
describe('Requirement 11: Client-side filtering only', () => {
  let pageContent;
  let filterContent;
  
  beforeAll(() => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    pageContent = fs.readFileSync(pagePath, 'utf8');
    
    const filterPath = path.join(REPO_PATH, 'lib/filterRecipes.ts');
    filterContent = fs.readFileSync(filterPath, 'utf8');
  });

  test('No fetch calls in page component', () => {
    expect(pageContent).not.toMatch(/fetch\s*\(|axios|useSWR|useQuery/);
  });

  test('No API route files exist', () => {
    const apiPath = path.join(REPO_PATH, 'app/api');
    const apiExists = fs.existsSync(apiPath);
    if (apiExists) {
      const files = fs.readdirSync(apiPath);
      expect(files.length).toBe(0);
    }
  });

  test('Recipes are imported directly from data file', () => {
    expect(pageContent).toContain("from '@/lib/recipes'");
  });

  test('Filter function uses JavaScript array methods', () => {
    expect(filterContent).toContain('.filter(');
  });

  test('Filter function uses some() for matching', () => {
    expect(filterContent).toContain('.some(');
  });

  test('Filter function uses every() for matching', () => {
    expect(filterContent).toContain('.every(');
  });

  test('No database imports or connections', () => {
    expect(pageContent).not.toMatch(/mongoose|prisma|sequelize|knex|pg|mysql|mongodb/i);
    expect(filterContent).not.toMatch(/mongoose|prisma|sequelize|knex|pg|mysql|mongodb/i);
  });

  test('Data is statically imported', () => {
    expect(pageContent).toMatch(/import.*recipes.*from/);
  });

  test('Page is marked as client component', () => {
    expect(pageContent).toContain("'use client'");
  });
});

// ============================================================
// ADDITIONAL TESTS: Recipe data validation
// ============================================================
describe('Additional: Recipe data validation', () => {
  let recipesContent;
  
  beforeAll(() => {
    const recipesPath = path.join(REPO_PATH, 'lib/recipes.ts');
    recipesContent = fs.readFileSync(recipesPath, 'utf8');
  });

  test('Each recipe has a unique id', () => {
    const idMatches = recipesContent.match(/id:\s*(\d+|'[^']+'|"[^"]+")/g);
    expect(idMatches).not.toBeNull();
    const uniqueIds = new Set(idMatches);
    expect(uniqueIds.size).toBe(idMatches.length);
  });

  test('Each recipe has an image URL', () => {
    const imageMatches = recipesContent.match(/image:\s*'[^']+'/g);
    expect(imageMatches).not.toBeNull();
    expect(imageMatches.length).toBeGreaterThanOrEqual(10);
  });

  test('Image URLs use placeholder service', () => {
    expect(recipesContent).toContain('via.placeholder.com');
  });

  test('Each recipe has at least 2 ingredients', () => {
    const ingredientArrays = recipesContent.match(/ingredients:\s*\[[^\]]+\]/g);
    expect(ingredientArrays).not.toBeNull();
    
    ingredientArrays.forEach(arr => {
      const ingredients = arr.match(/'[^']+'/g);
      expect(ingredients).not.toBeNull();
      expect(ingredients.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================
// ADDITIONAL TESTS: Component structure
// ============================================================
describe('Additional: Component structure', () => {
  test('All required component files exist', () => {
    const components = [
      'IngredientSelector.tsx',
      'RecipeCard.tsx',
      'RecipeGrid.tsx',
      'FilterModeToggle.tsx'
    ];
    
    components.forEach(component => {
      const componentPath = path.join(REPO_PATH, 'components', component);
      expect(fs.existsSync(componentPath)).toBe(true);
    });
  });

  test('Components directory exists', () => {
    const componentsPath = path.join(REPO_PATH, 'components');
    expect(fs.existsSync(componentsPath)).toBe(true);
    expect(fs.statSync(componentsPath).isDirectory()).toBe(true);
  });

  test('Lib directory exists with data files', () => {
    const libPath = path.join(REPO_PATH, 'lib');
    expect(fs.existsSync(libPath)).toBe(true);
    expect(fs.statSync(libPath).isDirectory()).toBe(true);
  });

  test('All components export default function', () => {
    const components = [
      'components/IngredientSelector.tsx',
      'components/RecipeCard.tsx',
      'components/RecipeGrid.tsx',
      'components/FilterModeToggle.tsx'
    ];
    
    components.forEach(component => {
      const content = fs.readFileSync(path.join(REPO_PATH, component), 'utf8');
      expect(content).toContain('export default function');
    });
  });
});

// ============================================================
// ADDITIONAL TESTS: Accessibility
// ============================================================
describe('Additional: Accessibility features', () => {
  test('Ingredient buttons have aria-pressed attribute', () => {
    const selectorPath = path.join(REPO_PATH, 'components/IngredientSelector.tsx');
    const content = fs.readFileSync(selectorPath, 'utf8');
    expect(content).toContain('aria-pressed');
  });

  test('Images have alt text', () => {
    const cardPath = path.join(REPO_PATH, 'components/RecipeCard.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('alt=');
  });

  test('Main page has semantic header element', () => {
    const pagePath = path.join(REPO_PATH, 'app/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');
    expect(content).toMatch(/<header|<h1/);
  });

  test('Layout has html lang attribute', () => {
    const layoutPath = path.join(REPO_PATH, 'app/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');
    expect(content).toContain('lang="en"');
  });
});
