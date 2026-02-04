/* eslint-disable testing-library/no-unnecessary-act */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import Clock from "./Clock";

// Mock console.log to avoid cluttering output and for testing purposes
const originalLog = console.log;

describe("Clock Component", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    console.log = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    console.log = originalLog;
  });

  test("Initial Render: displays time, default locale en-US, title and button", () => {
    render(<Clock />);

    // Title
    expect(screen.getByText("Simple Clock App using React Class Component")).toBeInTheDocument();

    // Button
    expect(screen.getByText("Change Language")).toBeInTheDocument();

    // Time displayed
    const timeElement = screen.getByRole("heading", { level: 2 });
    expect(timeElement).toBeInTheDocument();
    // Default locale en-US (Checks for AM/PM which is standard for en-US time string)
    expect(timeElement.textContent).toMatch(/AM|PM/);
  });

  test("Timer Behavior: updates every second", () => {
    render(<Clock />);
    const timeElement = screen.getByRole("heading", { level: 2 });
    const initialTimeText = timeElement.textContent;

    // Update every 1000ms
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const timeAfterOneSec = timeElement.textContent;
    expect(timeAfterOneSec).not.toBe(initialTimeText);

    // Multiple ticks
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(timeElement.textContent).not.toBe(timeAfterOneSec);
  });

  test("Locale Switching: switches, changes format, persists across ticks", () => {
    render(<Clock />);
    const changeButton = screen.getByText("Change Language");
    const timeElement = screen.getByRole("heading", { level: 2 });

    // Initial check: en-US (Latin digits)
    expect(timeElement.textContent).toMatch(/[0-9]+:[0-9]+:[0-9]+/);

    // Click button switch to bn-BD
    fireEvent.click(changeButton);

    // Check format change to Bengali digits (Requirement 7 & 9)
    // We check for Bengali digits presence.
    expect(timeElement.textContent).toMatch(/[\u09E6-\u09EF]/);

    // Advance timer, locale persists (Requirement 10)
    const timeWhenBn = timeElement.textContent;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(timeElement.textContent).not.toBe(timeWhenBn);
    // Verify locale remains bn-BD (still has Bengali digits)
    expect(timeElement.textContent).toMatch(/[\u09E6-\u09EF]/);

    // Click again, switch back to en-US (Requirement 8)
    fireEvent.click(changeButton);
    expect(timeElement.textContent).toMatch(/[0-9]+:[0-9]+:[0-9]+/);
    expect(timeElement.textContent).not.toMatch(/[\u09E6-\u09EF]/);
  });

  test("Lifecycle: setInterval called on mount, clearInterval on unmount", () => {
    jest.spyOn(global, "setInterval");
    jest.spyOn(global, "clearInterval");

    const { unmount } = render(<Clock />);

    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);

    unmount();

    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  test("Button Optimization: does not re-render on time updates, re-renders on locale change", () => {
    render(<Clock />);

    // Initial render logs
    expect(console.log).toHaveBeenCalledWith("Clock Component is Rendered");
    expect(console.log).toHaveBeenCalledWith("Button Component is Rendered");

    console.log.mockClear();

    // Advance timer -> Time changes
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Clock re-renders
    expect(console.log).toHaveBeenCalledWith("Clock Component is Rendered");
    // Button should NOT re-render
    expect(console.log).not.toHaveBeenCalledWith("Button Component is Rendered");

    console.log.mockClear();

    // Switch Locale
    const changeButton = screen.getByText("Change Language");
    fireEvent.click(changeButton);

    // Both re-render
    expect(console.log).toHaveBeenCalledWith("Clock Component is Rendered");
    expect(console.log).toHaveBeenCalledWith("Button Component is Rendered");
  });
});
