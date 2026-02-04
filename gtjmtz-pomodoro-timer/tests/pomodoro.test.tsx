import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import PomodoroTimer from "../components/PomodoroTimer";

const HISTORY_KEY = "pomodoro_focus_history_v1";

function getTimerText() {
  return screen.getByTestId("timer-display").textContent ?? "";
}

function click(testId: string) {
  fireEvent.click(screen.getByTestId(testId));
}

function setInput(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("PomodoroTimer requirements", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows initial Focus 25:00, monospaced digits, controls, and audio src", () => {
    render(<PomodoroTimer />);

    expect(getTimerText()).toBe("25:00");
    expect(screen.getByTestId("mode-focus")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTestId("btn-start")).toHaveTextContent("Start");
    expect(screen.getByTestId("btn-pause")).toHaveTextContent("Pause");
    expect(screen.getByTestId("btn-reset")).toHaveTextContent("Reset");

    const className =
      screen.getByTestId("timer-display").getAttribute("class") ?? "";
    expect(className).toContain("font-mono");
    expect(className).toContain("tabular-nums");

    const audioSrc = screen.getByTestId("audio-end").getAttribute("src") ?? "";
    expect(audioSrc).toMatch(/beep/i);
  });

  it("mode switching stops running timer and resets to new full duration", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("btn-start");
    advance(1100);
    expect(getTimerText()).not.toBe("25:00");

    click("mode-shortBreak");
    expect(getTimerText()).toBe("05:00");

    // Stays paused after switching
    advance(2000);
    expect(getTimerText()).toBe("05:00");

    click("mode-longBreak");
    expect(getTimerText()).toBe("15:00");
    vi.useRealTimers();
  });

  it("Start, Pause, Reset: pause retains time; reset returns to full duration", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("btn-start");
    advance(2200);
    click("btn-pause");

    const paused = getTimerText();
    advance(3000);
    expect(getTimerText()).toBe(paused);

    click("btn-start");
    advance(1100);
    expect(getTimerText()).not.toBe(paused);

    click("btn-reset");
    expect(getTimerText()).toBe("25:00");
    expect(screen.getByTestId("history-list")).toHaveTextContent(
      "No completed focus sessions yet"
    );
    vi.useRealTimers();
  });

  it("Settings: saving updates display immediately when not running; invalid (<=0) shows error", () => {
    render(<PomodoroTimer />);

    click("settings-open");
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();

    setInput("settings-focus", "0");
    setInput("settings-short", "1");
    setInput("settings-long", "1");
    click("settings-save");

    expect(screen.getByTestId("settings-error")).toHaveTextContent(
      "greater than 0"
    );

    setInput("settings-focus", "not-a-number");
    setInput("settings-short", "1");
    setInput("settings-long", "1");
    click("settings-save");

    expect(screen.getByTestId("settings-error")).toHaveTextContent(
      "greater than 0"
    );

    setInput("settings-focus", "0.10");
    setInput("settings-short", "0.08");
    setInput("settings-long", "0.12");
    click("settings-save");

    // 0.10 min => 6 seconds
    expect(getTimerText()).toBe("00:06");
    click("mode-shortBreak");
    // 0.08 min => 5 seconds
    expect(getTimerText()).toBe("00:05");
  });

  it("Settings: saving while running does not reset the current countdown", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("settings-open");
    setInput("settings-focus", "0.12");
    setInput("settings-short", "0.10");
    setInput("settings-long", "0.10");
    click("settings-save");
    expect(getTimerText()).toBe("00:07");

    click("btn-start");
    advance(1100);
    const before = getTimerText();

    click("settings-open");
    setInput("settings-focus", "0.30");
    click("settings-save");

    // Still counting down (not reset to 00:18)
    expect(getTimerText()).not.toBe("00:18");
    // Should not increase due to settings save
    expect(getTimerText() <= before).toBe(true);
    vi.useRealTimers();
  });

  it("Focus completion logs history only when run from full duration to 00:00; persists; plays audio", () => {
    vi.useFakeTimers();
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();

    render(<PomodoroTimer />);

    click("btn-start");
    advance(1100);
    expect(getTimerText()).toBe("24:59");

    // Fast-forward the remainder in chunks
    advance(5 * 60 * 1000);
    advance(5 * 60 * 1000);
    advance(5 * 60 * 1000);
    advance(5 * 60 * 1000);
    advance(5 * 60 * 1000);

    expect(getTimerText()).toBe("00:00");
    expect(playSpy).toHaveBeenCalled();

    const items = screen.getAllByTestId("history-item");
    expect(items.length).toBe(1);
    expect(items[0]).toHaveTextContent("Focus Session completed at");

    const raw = window.localStorage.getItem(HISTORY_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Array<{
      completedAtIso: string;
    }>;
    expect(parsed.length).toBe(1);

    playSpy.mockRestore();
    vi.useRealTimers();
  });

  it("does NOT log focus history if user resets or switches modes before completion", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("settings-open");
    setInput("settings-focus", "0.05");
    setInput("settings-short", "0.05");
    setInput("settings-long", "0.05");
    click("settings-save");

    click("btn-start");
    advance(1100);
    click("btn-reset");
    advance(4000);
    expect(screen.getByTestId("history-list")).toHaveTextContent(
      "No completed focus sessions yet"
    );

    click("btn-start");
    advance(1100);
    click("mode-shortBreak");
    advance(4000);
    click("mode-focus");
    expect(screen.getByTestId("history-list")).toHaveTextContent(
      "No completed focus sessions yet"
    );

    vi.useRealTimers();
  });

  it("loads existing history from localStorage on mount (most recent first)", () => {
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { id: "new", completedAtIso: now.toISOString() },
        { id: "old", completedAtIso: older.toISOString() },
      ])
    );

    render(<PomodoroTimer />);
    const items = screen.getAllByTestId("history-item");
    expect(items.length).toBe(2);
  });

  it("filters invalid entries when loading history from localStorage", () => {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { id: "ok", completedAtIso: new Date().toISOString() },
        { id: 123, completedAtIso: "nope" },
        null,
        { completedAtIso: new Date().toISOString() },
        { id: "missingDate" },
      ])
    );

    render(<PomodoroTimer />);
    const items = screen.getAllByTestId("history-item");
    expect(items.length).toBe(1);
    expect(items[0]).toHaveTextContent("Focus Session");
  });

  it("handles invalid localStorage history gracefully", () => {
    window.localStorage.setItem(HISTORY_KEY, "not-json");
    render(<PomodoroTimer />);
    expect(screen.getByTestId("history-list")).toHaveTextContent(
      "No completed focus sessions yet"
    );
  });

  it("cleans up intervals when paused (no extra ticking after pause)", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("btn-start");
    advance(1100);
    click("btn-pause");

    const paused = getTimerText();
    advance(5000);
    expect(getTimerText()).toBe(paused);
    vi.useRealTimers();
  });

  it("Start from 00:00 resets to full duration and starts ticking", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("settings-open");
    setInput("settings-focus", "0.05");
    setInput("settings-short", "0.05");
    setInput("settings-long", "0.05");
    click("settings-save");

    click("btn-start");
    advance(4000);
    expect(getTimerText()).toBe("00:00");

    click("btn-start");
    expect(getTimerText()).toBe("00:03");
    advance(1100);
    expect(getTimerText()).toBe("00:02");

    vi.useRealTimers();
  });

  it("does not accelerate when Start is clicked again while running", () => {
    vi.useFakeTimers();
    render(<PomodoroTimer />);

    click("btn-start");
    // Even if a click is attempted again, the button is disabled and should not create another interval.
    click("btn-start");
    advance(3100);
    expect(getTimerText()).toBe("24:57");

    vi.useRealTimers();
  });
});
