// Example of what meta-test should catch - this is a BAD test
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemperatureCalculator from '../repository_before/src/components/TemperatureCalculator';

// Mock Math to avoid real testing
jest.mock('Math', () => ({
  round: jest.fn(() => 42)
}));

// Spy on parseFloat to bypass conversion logic
const parseFloatSpy = jest.spyOn(global, 'parseFloat').mockReturnValue(100);

describe('TemperatureCalculator BAD EXAMPLE', () => {
  test('always passes without real testing', () => {
    render(<TemperatureCalculator />);
    
    // This test doesn't actually verify anything meaningful
    expect(screen.getByDisplayValue('')).toBeInTheDocument();
    
    // Hardcoded expectation that will always pass
    expect('32.00').toBe('32.00');
  });

  test('uses mocked values', () => {
    render(<TemperatureCalculator />);
    
    // This uses the mocked parseFloat
    expect(parseFloatSpy).toHaveBeenCalled();
  });
});

// This represents what meta-tests should REJECT
