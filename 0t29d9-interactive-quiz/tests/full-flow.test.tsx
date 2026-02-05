import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { questions } from '@/lib/questions';

// Mock canvas-confetti
jest.mock('canvas-confetti', () => jest.fn());

describe('Interactive Quiz Flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('completes the full 10-question quiz flow correctly', async () => {
    render(<Home />);

    // 1. Start Screen
    expect(screen.getByText(/Ultimate/i)).toBeInTheDocument();
    
    // Check "Start Quiz" button label
    const startButton = screen.getByRole('button', { name: /Start Quiz/i });
    fireEvent.click(startButton);

    // Fast-forward exit animation of Start Screen (0.5s)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // 2. Iterate through all questions
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        
        // Wait for question to appear
        await waitFor(() => {
             // "Question X of 10" - Requirement 5 & Comment
            expect(screen.getByText(new RegExp(`Question ${i + 1} of ${questions.length}`))).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: question.questionText })).toBeInTheDocument();
        });

        // Click Correct Answer
        const correctOptionText = question.options[question.correctAnswerIndex];
        const correctButton = screen.getByText(correctOptionText).closest('button');
        
        expect(correctButton).toBeInTheDocument();
        fireEvent.click(correctButton!);

        // Verify Feedback (Green)
        expect(correctButton).toHaveClass('border-emerald-500');

        // VERIFY DELAY (Requirement 7 & Comment)
        // Immediately after click, we should still verify the CURRENT question is visible
        // effectively proving we haven't moved on yet.
        expect(screen.getByText(new RegExp(`Question ${i + 1} of ${questions.length}`))).toBeInTheDocument();

        // Fast-forward delay (1.5s)
        act(() => {
            jest.advanceTimersByTime(1500);
        });
    }

    // 3. Result Screen
    await waitFor(() => {
        expect(screen.getByText('Quiz Complete')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Allow score animation to complete
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    
    // Score should be 10/10 (100%) - "You scored 10 out of 10"
    await waitFor(() => {
        expect(screen.getByText(/You scored/)).toBeInTheDocument();
        const tens = screen.getAllByText('10');
        expect(tens.length).toBeGreaterThanOrEqual(2); // Score and Total
        expect(screen.getByText(/out of/)).toBeInTheDocument();
    });

    // > 80% -> "Outstanding Performance!"
    expect(screen.getByText(/Outstanding Performance!/i)).toBeInTheDocument();

    // 4. Restart
    const restartButton = screen.getByText('Restart Quiz');
    fireEvent.click(restartButton);

    // Back to Start Screen
    await waitFor(() => {
        // Advance timers incrementally to trigger animation frames
        jest.advanceTimersByTime(100); 
        expect(screen.getByText(/Ultimate/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
