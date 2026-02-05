/**
 * Behavioral tests for FilterModeToggle component
 * Tests mode switching clicks and visual state
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FilterModeToggle from '@/components/FilterModeToggle';

describe('FilterModeToggle: Click behavior', () => {
  test('clicking "all" button calls onModeChange with "all"', () => {
    const mockChange = jest.fn();
    render(<FilterModeToggle mode="any" onModeChange={mockChange} />);

    const allButton = screen.getByTestId('filter-mode-all');
    fireEvent.click(allButton);

    expect(mockChange).toHaveBeenCalledTimes(1);
    expect(mockChange).toHaveBeenCalledWith('all');
  });

  test('clicking "any" button calls onModeChange with "any"', () => {
    const mockChange = jest.fn();
    render(<FilterModeToggle mode="all" onModeChange={mockChange} />);

    const anyButton = screen.getByTestId('filter-mode-any');
    fireEvent.click(anyButton);

    expect(mockChange).toHaveBeenCalledTimes(1);
    expect(mockChange).toHaveBeenCalledWith('any');
  });

  test('clicking current mode button still triggers callback', () => {
    const mockChange = jest.fn();
    render(<FilterModeToggle mode="any" onModeChange={mockChange} />);

    const anyButton = screen.getByTestId('filter-mode-any');
    fireEvent.click(anyButton);

    expect(mockChange).toHaveBeenCalledWith('any');
  });

  test('rapid mode switching works correctly', () => {
    const mockChange = jest.fn();
    render(<FilterModeToggle mode="any" onModeChange={mockChange} />);

    const anyButton = screen.getByTestId('filter-mode-any');
    const allButton = screen.getByTestId('filter-mode-all');

    fireEvent.click(allButton);
    fireEvent.click(anyButton);
    fireEvent.click(allButton);
    fireEvent.click(anyButton);

    expect(mockChange).toHaveBeenCalledTimes(4);
    expect(mockChange).toHaveBeenNthCalledWith(1, 'all');
    expect(mockChange).toHaveBeenNthCalledWith(2, 'any');
    expect(mockChange).toHaveBeenNthCalledWith(3, 'all');
    expect(mockChange).toHaveBeenNthCalledWith(4, 'any');
  });
});

describe('FilterModeToggle: Visual state', () => {
  test('"any" button is highlighted when mode is "any"', () => {
    render(<FilterModeToggle mode="any" onModeChange={jest.fn()} />);

    const anyButton = screen.getByTestId('filter-mode-any');
    expect(anyButton.className).toContain('bg-blue');
  });

  test('"all" button is highlighted when mode is "all"', () => {
    render(<FilterModeToggle mode="all" onModeChange={jest.fn()} />);

    const allButton = screen.getByTestId('filter-mode-all');
    expect(allButton.className).toContain('bg-blue');
  });

  test('inactive button does not have highlight', () => {
    render(<FilterModeToggle mode="any" onModeChange={jest.fn()} />);

    const allButton = screen.getByTestId('filter-mode-all');
    expect(allButton.className).not.toContain('bg-blue-500');
  });

  test('visual state updates when mode prop changes', () => {
    const { rerender } = render(
      <FilterModeToggle mode="any" onModeChange={jest.fn()} />
    );

    const anyButton = screen.getByTestId('filter-mode-any');
    const allButton = screen.getByTestId('filter-mode-all');

    expect(anyButton.className).toContain('bg-blue');

    rerender(<FilterModeToggle mode="all" onModeChange={jest.fn()} />);

    expect(allButton.className).toContain('bg-blue');
  });
});

describe('FilterModeToggle: Description text', () => {
  test('shows description for "any" mode', () => {
    render(<FilterModeToggle mode="any" onModeChange={jest.fn()} />);

    const toggle = screen.getByTestId('filter-mode-toggle');
    expect(toggle.textContent).toMatch(/at least one/i);
  });

  test('shows description for "all" mode', () => {
    render(<FilterModeToggle mode="all" onModeChange={jest.fn()} />);

    const toggle = screen.getByTestId('filter-mode-toggle');
    expect(toggle.textContent).toMatch(/all.*ingredients/i);
  });

  test('description updates when mode changes', () => {
    const { rerender } = render(
      <FilterModeToggle mode="any" onModeChange={jest.fn()} />
    );

    expect(screen.getByTestId('filter-mode-toggle').textContent).toMatch(/at least one/i);

    rerender(<FilterModeToggle mode="all" onModeChange={jest.fn()} />);

    expect(screen.getByTestId('filter-mode-toggle').textContent).toMatch(/all.*ingredients/i);
  });
});
