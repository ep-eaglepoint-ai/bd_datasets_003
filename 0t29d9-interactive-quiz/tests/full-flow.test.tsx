import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Home from '@/app/page';

// Mock the questions to have predictable data for testing
jest.mock('@/lib/questions', () => ({
  questions: [
    {
      id: 1,
      questionText: "Question 1",
      options: ["A1", "B1", "C1", "D1"],
      correctAnswerIndex: 0, // A1
    },
    {
      id: 2,
      questionText: "Question 2",
      options: ["A2", "B2", "C2", "D2"],
      correctAnswerIndex: 1, // B2
    },
  ],
}));

// Mock canvas-confetti
jest.mock('canvas-confetti', () => jest.fn());

describe('Interactive Quiz Flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('completes the full quiz flow correctly', async () => {
    render(<Home />);

    // 1. Start Screen
    expect(screen.getByText(/Ultimate/i)).toBeInTheDocument();
    
    // Use getByRole to find the button more reliably or text with regex
    const startButton = screen.getByRole('button', { name: /Start Challenge/i });
    fireEvent.click(startButton);

    // 2. Question 1
    await waitFor(() => {
      // Use heading to distinguish from progress text
      expect(screen.getByRole('heading', { name: 'Question 1' })).toBeInTheDocument();
    });
    // Check for progress text "Question 1 / 2"
    expect(screen.getByText(/Question \d+ \/ \d+/)).toBeInTheDocument();

    // Click Correct Answer (A1)
    const optionA1 = screen.getByText('A1');
    fireEvent.click(optionA1);

    // Verify correct feedback (emerald background)
    const buttonA1 = optionA1.closest('button');
    // Using simple string match for class might be flaky with twMerge, but testing-library handles it ok usually.
    // However, the component sets border-emerald-500.
    expect(buttonA1).toHaveClass('border-emerald-500');

    // Fast-forward delay
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // 3. Question 2
    await waitFor(() => {
      expect(screen.getByText('Question 2')).toBeInTheDocument();
    });
    
    // Click Incorrect Answer (A2 - correct is B2)
    const optionA2 = screen.getByText('A2');
    fireEvent.click(optionA2);

    const buttonA2 = optionA2.closest('button');
    expect(buttonA2).toHaveClass('border-rose-500'); // Selected incorrect
    
    const optionB2 = screen.getByText('B2');
    const buttonB2 = optionB2.closest('button');
    expect(buttonB2).toHaveClass('border-emerald-500'); // Actual correct

    // Fast-forward delay
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // 4. Result Screen
    await waitFor(() => {
        expect(screen.getByText('Quiz Complete')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    // Score should be 1/2 (50%)
    await waitFor(() => {
       // Wait for animation to finish and show '1'
       // Note: "1" might be ambiguous if used elsewhere, but in this context inside the score card it should be fine.
       // However, '0' matches "50%" or other numbers? No. '1' is specific.
       expect(screen.getByText('1')).toBeInTheDocument(); 
    });

    expect(screen.getByText('/ 2')).toBeInTheDocument();
    // 50% < 60% -> "Keep Learning!"
    expect(screen.getByText(/Keep Learning!/i)).toBeInTheDocument();

    // 5. Restart
    const restartButton = screen.getByText('Try Again');
    fireEvent.click(restartButton);

    // Back to Start Screen
    await waitFor(() => {
        expect(screen.getByText(/Ultimate/i)).toBeInTheDocument();
    });
  });
});
