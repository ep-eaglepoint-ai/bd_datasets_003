/**
 * Behavioral tests for RecipeCard component
 * Tests difficulty badge colors and recipe display
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeCard from '@/components/RecipeCard';
import { Recipe } from '@/lib/types';

const baseRecipe: Recipe = {
  id: 1,
  title: 'Test Recipe',
  ingredients: ['Chicken', 'Rice', 'Garlic'],
  difficulty: 'Easy',
  image: 'https://via.placeholder.com/300x200?text=Test'
};

describe('RecipeCard: Content display', () => {
  test('displays recipe title', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();
  });

  test('displays recipe image with correct src', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('placeholder'));
  });

  test('displays recipe ingredients', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    expect(screen.getByText(/Chicken/)).toBeInTheDocument();
  });

  test('displays difficulty badge', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    expect(screen.getByTestId('difficulty-badge')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  test('image has alt text for accessibility', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt');
  });
});

describe('RecipeCard: Difficulty badge colors', () => {
  test('Easy difficulty has green background', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, difficulty: 'Easy' }} />);
    const badge = screen.getByTestId('difficulty-badge');
    expect(badge.className).toContain('green');
  });

  test('Medium difficulty has yellow/orange background', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, difficulty: 'Medium' }} />);
    const badge = screen.getByTestId('difficulty-badge');
    expect(badge.className).toMatch(/yellow|orange/);
  });

  test('Hard difficulty has red background', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, difficulty: 'Hard' }} />);
    const badge = screen.getByTestId('difficulty-badge');
    expect(badge.className).toContain('red');
  });

  test('badge has white text for readability', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    const badge = screen.getByTestId('difficulty-badge');
    expect(badge.className).toContain('text-white');
  });

  test('badge has rounded styling', () => {
    render(<RecipeCard recipe={baseRecipe} />);
    const badge = screen.getByTestId('difficulty-badge');
    expect(badge.className).toMatch(/rounded/);
  });
});

describe('RecipeCard: Different recipes', () => {
  test('renders different recipe titles correctly', () => {
    const { rerender } = render(<RecipeCard recipe={baseRecipe} />);
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();

    rerender(<RecipeCard recipe={{ ...baseRecipe, title: 'Another Recipe' }} />);
    expect(screen.getByText('Another Recipe')).toBeInTheDocument();
  });

  test('renders different difficulty levels correctly', () => {
    const { rerender } = render(
      <RecipeCard recipe={{ ...baseRecipe, difficulty: 'Easy' }} />
    );
    expect(screen.getByText('Easy')).toBeInTheDocument();

    rerender(<RecipeCard recipe={{ ...baseRecipe, difficulty: 'Medium' }} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();

    rerender(<RecipeCard recipe={{ ...baseRecipe, difficulty: 'Hard' }} />);
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  test('renders recipes with many ingredients', () => {
    const manyIngredients: Recipe = {
      ...baseRecipe,
      ingredients: ['Chicken', 'Rice', 'Garlic', 'Onions', 'Tomatoes', 'Bell Pepper']
    };

    render(<RecipeCard recipe={manyIngredients} />);
    expect(screen.getByText('Test Recipe')).toBeInTheDocument();
  });
});
