/**
 * Behavioral tests for RecipeGrid component
 * Tests empty states and recipe display
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeGrid from '@/components/RecipeGrid';
import { Recipe } from '@/lib/types';

const mockRecipe: Recipe = {
  id: 1,
  title: 'Test Recipe',
  ingredients: ['Chicken', 'Rice'],
  difficulty: 'Easy',
  image: 'https://via.placeholder.com/300x200'
};

describe('RecipeGrid: Empty states', () => {
  test('shows no-selection message when hasSelection is false', () => {
    render(<RecipeGrid recipes={[]} hasSelection={false} />);

    const message = screen.getByTestId('no-selection-message');
    expect(message).toBeInTheDocument();
    expect(message.textContent).toMatch(/select ingredients/i);
  });

  test('shows no-recipes message when hasSelection is true but no recipes', () => {
    render(<RecipeGrid recipes={[]} hasSelection={true} />);

    const message = screen.getByTestId('no-recipes-message');
    expect(message).toBeInTheDocument();
    expect(message.textContent).toMatch(/no recipes/i);
  });

  test('no-selection message includes helpful prompt', () => {
    render(<RecipeGrid recipes={[]} hasSelection={false} />);

    const message = screen.getByTestId('no-selection-message');
    expect(message.textContent?.toLowerCase()).toMatch(/select|choose|pick/);
  });

  test('no-recipes message suggests trying different ingredients', () => {
    render(<RecipeGrid recipes={[]} hasSelection={true} />);

    const message = screen.getByTestId('no-recipes-message');
    expect(message.textContent?.toLowerCase()).toMatch(/different|other|try/);
  });

  test('no empty state messages when recipes exist', () => {
    render(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    expect(screen.queryByTestId('no-selection-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-recipes-message')).not.toBeInTheDocument();
  });
});

describe('RecipeGrid: Recipe display', () => {
  test('renders recipe cards when recipes provided', () => {
    render(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    expect(screen.getByText('Test Recipe')).toBeInTheDocument();
  });

  test('renders multiple recipe cards', () => {
    const recipes: Recipe[] = [
      { ...mockRecipe, id: 1, title: 'Recipe One' },
      { ...mockRecipe, id: 2, title: 'Recipe Two' },
      { ...mockRecipe, id: 3, title: 'Recipe Three' },
    ];

    render(<RecipeGrid recipes={recipes} hasSelection={true} />);

    expect(screen.getByText('Recipe One')).toBeInTheDocument();
    expect(screen.getByText('Recipe Two')).toBeInTheDocument();
    expect(screen.getByText('Recipe Three')).toBeInTheDocument();
  });

  test('grid has responsive column classes', () => {
    render(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    const grid = screen.getByTestId('recipe-grid');
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toMatch(/md:grid-cols-[23]/);
    expect(grid.className).toMatch(/lg:grid-cols-[34]/);
  });
});

describe('RecipeGrid: State transitions', () => {
  test('transitions from no-selection to showing recipes', () => {
    const { rerender } = render(<RecipeGrid recipes={[]} hasSelection={false} />);

    // Initially shows no-selection message
    expect(screen.getByTestId('no-selection-message')).toBeInTheDocument();

    // Rerender with recipes
    rerender(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    // Now shows recipes
    expect(screen.queryByTestId('no-selection-message')).not.toBeInTheDocument();
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();
  });

  test('transitions from recipes to no-recipes message', () => {
    const { rerender } = render(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    // Initially shows recipe
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();

    // Rerender with no recipes but selection exists
    rerender(<RecipeGrid recipes={[]} hasSelection={true} />);

    // Now shows no-recipes message
    expect(screen.queryByText('Test Recipe')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-recipes-message')).toBeInTheDocument();
  });

  test('transitions from recipes to no-selection message', () => {
    const { rerender } = render(<RecipeGrid recipes={[mockRecipe]} hasSelection={true} />);

    // Initially shows recipe
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();

    // Rerender with no selection
    rerender(<RecipeGrid recipes={[]} hasSelection={false} />);

    // Now shows no-selection message
    expect(screen.queryByText('Test Recipe')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-selection-message')).toBeInTheDocument();
  });
});
