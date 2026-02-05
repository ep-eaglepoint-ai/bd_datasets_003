/**
 * Behavioral tests for IngredientSelector component
 * Tests actual clicks and state changes
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import IngredientSelector from '@/components/IngredientSelector';

describe('IngredientSelector: Click behavior', () => {
  test('clicking an ingredient button triggers onToggle callback', () => {
    const mockToggle = jest.fn();
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef', 'Rice']}
        selectedIngredients={[]}
        onToggle={mockToggle}
      />
    );

    const chickenButton = screen.getByText('Chicken');
    fireEvent.click(chickenButton);

    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledWith('Chicken');
  });

  test('clicking multiple ingredients triggers onToggle for each', () => {
    const mockToggle = jest.fn();
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef', 'Rice']}
        selectedIngredients={[]}
        onToggle={mockToggle}
      />
    );

    fireEvent.click(screen.getByText('Chicken'));
    fireEvent.click(screen.getByText('Beef'));
    fireEvent.click(screen.getByText('Rice'));

    expect(mockToggle).toHaveBeenCalledTimes(3);
    expect(mockToggle).toHaveBeenNthCalledWith(1, 'Chicken');
    expect(mockToggle).toHaveBeenNthCalledWith(2, 'Beef');
    expect(mockToggle).toHaveBeenNthCalledWith(3, 'Rice');
  });

  test('clicking already selected ingredient triggers onToggle for deselection', () => {
    const mockToggle = jest.fn();
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={['Chicken']}
        onToggle={mockToggle}
      />
    );

    fireEvent.click(screen.getByText('Chicken'));
    expect(mockToggle).toHaveBeenCalledWith('Chicken');
  });

  test('rapid clicking works correctly', () => {
    const mockToggle = jest.fn();
    render(
      <IngredientSelector
        ingredients={['Chicken']}
        selectedIngredients={[]}
        onToggle={mockToggle}
      />
    );

    const button = screen.getByText('Chicken');
    
    // Rapid clicks
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockToggle).toHaveBeenCalledTimes(5);
  });
});

describe('IngredientSelector: Visual state indication', () => {
  test('selected ingredient shows aria-pressed=true', () => {
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={['Chicken']}
        onToggle={jest.fn()}
      />
    );

    const chickenButton = screen.getByText('Chicken');
    const beefButton = screen.getByText('Beef');

    expect(chickenButton).toHaveAttribute('aria-pressed', 'true');
    expect(beefButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('selected ingredient has green background class', () => {
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={['Chicken']}
        onToggle={jest.fn()}
      />
    );

    const chickenButton = screen.getByText('Chicken');
    const beefButton = screen.getByText('Beef');

    expect(chickenButton.className).toContain('bg-green');
    expect(beefButton.className).not.toContain('bg-green');
  });

  test('visual state updates when selectedIngredients prop changes', () => {
    const { rerender } = render(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={[]}
        onToggle={jest.fn()}
      />
    );

    // Initially neither selected
    expect(screen.getByText('Chicken')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Beef')).toHaveAttribute('aria-pressed', 'false');

    // Rerender with Chicken selected
    rerender(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={['Chicken']}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByText('Chicken')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Beef')).toHaveAttribute('aria-pressed', 'false');

    // Rerender with both selected
    rerender(
      <IngredientSelector
        ingredients={['Chicken', 'Beef']}
        selectedIngredients={['Chicken', 'Beef']}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByText('Chicken')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Beef')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('IngredientSelector: Rendering all ingredients', () => {
  test('renders all provided ingredients as buttons', () => {
    const ingredients = ['Chicken', 'Beef', 'Rice', 'Pasta', 'Tomatoes'];
    
    render(
      <IngredientSelector
        ingredients={ingredients}
        selectedIngredients={[]}
        onToggle={jest.fn()}
      />
    );

    ingredients.forEach(ing => {
      expect(screen.getByText(ing)).toBeInTheDocument();
    });
  });

  test('each ingredient button has data-testid attribute', () => {
    render(
      <IngredientSelector
        ingredients={['Chicken', 'Bell Pepper']}
        selectedIngredients={[]}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByTestId('ingredient-chicken')).toBeInTheDocument();
    expect(screen.getByTestId('ingredient-bell-pepper')).toBeInTheDocument();
  });
});
