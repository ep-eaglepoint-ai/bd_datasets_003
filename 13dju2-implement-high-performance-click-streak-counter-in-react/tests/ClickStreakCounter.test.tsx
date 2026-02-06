import { render, screen, fireEvent, act } from "@testing-library/react";
import { ClickStreakCounter } from "../repository_after/src/ClickStreakCounter";

describe("ClickStreakCounter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe("Increment streak per click", () => {
    it("test_increment_on_click", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      expect(screen.getByTestId("current-count")).toHaveTextContent("1");

      fireEvent.click(button);
      expect(screen.getByTestId("current-count")).toHaveTextContent("2");

      fireEvent.click(button);
      expect(screen.getByTestId("current-count")).toHaveTextContent("3");
    });

    it("test_initial_state_zero", () => {
      render(<ClickStreakCounter />);
      expect(screen.getByTestId("current-count")).toHaveTextContent("0");
      expect(screen.getByTestId("highest-streak")).toHaveTextContent("0");
    });

    it("test_rapid_clicking_accuracy", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      for (let i = 0; i < 50; i++) {
        fireEvent.click(button);
      }

      expect(screen.getByTestId("current-count")).toHaveTextContent("50");
    });
  });

  describe("Reset exactly after 1 second inactivity", () => {
    it("test_reset_after_one_second", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(screen.getByTestId("current-count")).toHaveTextContent("3");

      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(screen.getByTestId("current-count")).toHaveTextContent("3");

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.getByTestId("current-count")).toHaveTextContent("0");
    });

    it("test_no_reset_if_click_before_timeout", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      fireEvent.click(button);

      expect(screen.getByTestId("current-count")).toHaveTextContent("3");
    });

    it("test_timer_reset_on_each_click", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(900);
      });
      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(900);
      });
      fireEvent.click(button);

      expect(screen.getByTestId("current-count")).toHaveTextContent("3");

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId("current-count")).toHaveTextContent("0");
    });
  });

  describe("Track highest streak", () => {
    it("test_highest_streak_updated_on_end", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId("highest-streak")).toHaveTextContent("3");
    });

    it("test_highest_streak_persists_across_rounds", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      for (let i = 0; i < 5; i++) fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId("highest-streak")).toHaveTextContent("5");

      for (let i = 0; i < 3; i++) fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId("highest-streak")).toHaveTextContent("5");

      for (let i = 0; i < 10; i++) fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId("highest-streak")).toHaveTextContent("10");
    });

    it("test_highest_streak_not_updated_for_lower", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      for (let i = 0; i < 10; i++) fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      for (let i = 0; i < 5; i++) fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId("highest-streak")).toHaveTextContent("10");
    });
  });

  describe("Avoid stale closures", () => {
    it("test_correct_count_with_interleaved_timers", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.click(button);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.click(button);

      expect(screen.getByTestId("current-count")).toHaveTextContent("5");
    });

    it("test_callback_receives_correct_count", () => {
      const mockCallback = jest.fn();
      render(<ClickStreakCounter onStreakEnd={mockCallback} />);
      const button = screen.getByTestId("click-button");

      for (let i = 0; i < 7; i++) {
        fireEvent.click(button);
        act(() => {
          jest.advanceTimersByTime(100);
        });
      }

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(mockCallback).toHaveBeenCalledWith(7);
    });
  });

  describe("Minimize re-renders", () => {
    it("test_render_count_matches_clicks", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      for (let i = 1; i <= 5; i++) {
        fireEvent.click(button);
        expect(screen.getByTestId("current-count")).toHaveTextContent(
          String(i),
        );
      }

      expect(screen.getByTestId("current-count")).toHaveTextContent("5");
    });
  });

  describe("Use React hooks only", () => {
    it("test_component_renders_without_error", () => {
      expect(() => render(<ClickStreakCounter />)).not.toThrow();
    });

    it("test_component_structure", () => {
      render(<ClickStreakCounter />);
      expect(screen.getByTestId("click-streak-counter")).toBeInTheDocument();
      expect(screen.getByTestId("click-button")).toBeInTheDocument();
      expect(screen.getByTestId("current-count")).toBeInTheDocument();
      expect(screen.getByTestId("highest-streak")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("test_multiple_instances_independent", () => {
      render(
        <>
          <div data-testid="counter1">
            <ClickStreakCounter />
          </div>
          <div data-testid="counter2">
            <ClickStreakCounter />
          </div>
        </>,
      );

      const buttons = screen.getAllByTestId("click-button");
      const currentCounts = screen.getAllByTestId("current-count");

      fireEvent.click(buttons[0]);
      fireEvent.click(buttons[0]);
      fireEvent.click(buttons[0]);

      fireEvent.click(buttons[1]);

      expect(currentCounts[0]).toHaveTextContent("3");
      expect(currentCounts[1]).toHaveTextContent("1");
    });

    it("test_very_rapid_clicking", () => {
      render(<ClickStreakCounter />);
      const button = screen.getByTestId("click-button");

      for (let i = 0; i < 100; i++) {
        fireEvent.click(button);
      }

      expect(screen.getByTestId("current-count")).toHaveTextContent("100");
    });
  });
});
