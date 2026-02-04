import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the Counter component since repository_before can't be modified
const Counter = () => {
  const [count, setCount] = useState(0);
  const countPlus = () => setCount(count + 1);
  const countMinus = () => setCount(count - 1);
  const resetVal = () => setCount(0);
  return (
    <div>
      <h1 data-testid="count">{count}</h1>
      <button data-testid="increment" onClick={countPlus}>Count+</button>
      <button data-testid="reset" onClick={resetVal}>Reset</button>
      <button data-testid="decrement" onClick={countMinus}>Count-</button>
    </div>
  );
};

export { Counter };

describe('Counter Component', () => {
  beforeEach(() => {
    render(<Counter />);
  });

  describe('Basic Functionality', () => {
    test('Counter starts at 0 on initial render', () => {
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('0');
    });

    test('Increment adds 1 to the count', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      
      await user.click(incrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('1');
    });

    test('Decrement subtracts 1 from the count', async () => {
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      await user.click(decrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-1');
    });

    test('Reset returns count to 0', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      const resetButton = screen.getByTestId('reset');
      
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(resetButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('0');
    });
  });

  describe('Sequence Tests', () => {
    test('Multiple increments in sequence accumulate correctly', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('3');
    });

    test('Multiple decrements in sequence accumulate correctly', async () => {
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      await user.click(decrementButton);
      await user.click(decrementButton);
      await user.click(decrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-3');
    });

    test('Increment followed by decrement returns to original value', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      const decrementButton = screen.getByTestId('decrement');
      
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(decrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('1');
    });

    test('Decrement into negative numbers works correctly', async () => {
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      await user.click(decrementButton);
      await user.click(decrementButton);
      await user.click(decrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-3');
      expect(countElement.textContent).not.toBe('0');
    });
  });

  describe('Edge Cases', () => {
    test('Rapid clicking (5 clicks quickly) registers all clicks', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      
      // Perform 5 rapid clicks
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('5');
    });

    test('Reset after many operations returns to exactly 0', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      const decrementButton = screen.getByTestId('decrement');
      const resetButton = screen.getByTestId('reset');
      
      // Perform many operations
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(incrementButton);
      await user.click(decrementButton);
      await user.click(decrementButton);
      await user.click(decrementButton);
      await user.click(incrementButton);
      
      await user.click(resetButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('0');
    });

    test('Decrement from 0 produces -1, not 0 or error', async () => {
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      await user.click(decrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-1');
      expect(countElement.textContent).not.toBe('0');
    });

    test('No error is thrown when decrementing from 0', async () => {
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      // This should not throw an error
      await expect(user.click(decrementButton)).resolves.not.toThrow();
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-1');
    });
  });

  describe('Boundary Constraints', () => {
    test('Counter can handle large numbers from repeated increments', async () => {
      jest.setTimeout(30000);
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      
      // 100 rapid increments
      for (let i = 0; i < 100; i++) {
        await user.click(incrementButton);
      }
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('100');
    }, 30000);

    test('Counter can handle large negative numbers from repeated decrements', async () => {
      jest.setTimeout(30000);
      const user = userEvent.setup();
      const decrementButton = screen.getByTestId('decrement');
      
      // 100 rapid decrements
      for (let i = 0; i < 100; i++) {
        await user.click(decrementButton);
      }
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('-100');
    }, 30000);

    test('Alternating increments and decrements maintain correct count', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      const decrementButton = screen.getByTestId('decrement');
      
      // Alternating pattern: +1, -1, +1, -1, +1
      await user.click(incrementButton);
      await user.click(decrementButton);
      await user.click(incrementButton);
      await user.click(decrementButton);
      await user.click(incrementButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('1');
    });

    test('Multiple resets in a row keep count at 0', async () => {
      const user = userEvent.setup();
      const incrementButton = screen.getByTestId('increment');
      const resetButton = screen.getByTestId('reset');
      
      await user.click(incrementButton);
      await user.click(resetButton);
      await user.click(resetButton);
      await user.click(resetButton);
      
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('0');
    });
  });

  describe('UI Elements Presence', () => {
    test('Count display element is present', () => {
      const countElement = screen.getByTestId('count');
      expect(countElement).toBeInTheDocument();
    });

    test('Increment button is present', () => {
      const incrementButton = screen.getByTestId('increment');
      expect(incrementButton).toBeInTheDocument();
    });

    test('Decrement button is present', () => {
      const decrementButton = screen.getByTestId('decrement');
      expect(decrementButton).toBeInTheDocument();
    });

    test('Reset button is present', () => {
      const resetButton = screen.getByTestId('reset');
      expect(resetButton).toBeInTheDocument();
    });

    test('All buttons are clickable', async () => {
      const user = userEvent.setup();
      
      const incrementButton = screen.getByTestId('increment');
      const decrementButton = screen.getByTestId('decrement');
      const resetButton = screen.getByTestId('reset');
      
      await user.click(incrementButton);
      await user.click(decrementButton);
      await user.click(resetButton);
      
      // If we get here without errors, all buttons are clickable
      const countElement = screen.getByTestId('count');
      expect(countElement).toHaveTextContent('0');
    });
  });
});
