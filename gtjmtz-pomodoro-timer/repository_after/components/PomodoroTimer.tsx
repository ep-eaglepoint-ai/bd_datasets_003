"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "focus" | "shortBreak" | "longBreak";

type DurationsMin = Record<Mode, number>;

type FocusHistoryEntry = {
  id: string;
  completedAtIso: string;
};

const HISTORY_STORAGE_KEY = "pomodoro_focus_history_v1";

const DEFAULT_DURATIONS_MIN: DurationsMin = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

function clampToValidMinutes(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 1;
  return value;
}

function toSecondsFromMinutes(minutes: number): number {
  return Math.max(0, Math.round(minutes * 60));
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function modeLabel(mode: Mode): string {
  switch (mode) {
    case "focus":
      return "Focus";
    case "shortBreak":
      return "Short Break";
    case "longBreak":
      return "Long Break";
  }
}

function formatCompletedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);

  return `${time} on ${day}`;
}

function safeParseHistory(raw: string | null): FocusHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized: FocusHistoryEntry[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "completedAtIso" in item &&
        typeof (item as { id: unknown }).id === "string" &&
        typeof (item as { completedAtIso: unknown }).completedAtIso === "string"
      ) {
        normalized.push({
          id: (item as { id: string }).id,
          completedAtIso: (item as { completedAtIso: string }).completedAtIso,
        });
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

export default function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [durationsMin, setDurationsMin] = useState<DurationsMin>(
    DEFAULT_DURATIONS_MIN
  );
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(() =>
    toSecondsFromMinutes(DEFAULT_DURATIONS_MIN.focus)
  );
  const [history, setHistory] = useState<FocusHistoryEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [sessionEligible, setSessionEligible] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const modeTotalSec = useMemo(() => {
    return {
      focus: toSecondsFromMinutes(durationsMin.focus),
      shortBreak: toSecondsFromMinutes(durationsMin.shortBreak),
      longBreak: toSecondsFromMinutes(durationsMin.longBreak),
    } satisfies Record<Mode, number>;
  }, [durationsMin.focus, durationsMin.shortBreak, durationsMin.longBreak]);

  useEffect(() => {
    const existing = safeParseHistory(
      window.localStorage.getItem(HISTORY_STORAGE_KEY)
    );
    setHistory(existing);
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    if (remainingSec !== 0) return;

    setIsRunning(false);

    const audio = audioRef.current;
    if (audio) {
      try {
        const maybePromise = audio.play();
        if (
          maybePromise &&
          typeof (maybePromise as Promise<void>).catch === "function"
        ) {
          void (maybePromise as Promise<void>).catch(() => {
            // Ignore autoplay / policy errors.
          });
        }
      } catch {
        // Ignore missing implementations (e.g. test environments).
      }
    }

    if (mode === "focus" && sessionEligible) {
      const completedAtIso = new Date().toISOString();
      const entry: FocusHistoryEntry = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`,
        completedAtIso,
      };
      setHistory((prev) => {
        const next = [entry, ...prev];
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }

    setSessionEligible(false);
  }, [isRunning, mode, remainingSec, sessionEligible]);

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setIsRunning(false);
    setMode(nextMode);
    setRemainingSec(modeTotalSec[nextMode]);
    setSessionEligible(false);
  };

  const handleStart = () => {
    if (isRunning) return;

    const totalSec = modeTotalSec[mode];
    const isAtFullOrZero = remainingSec === totalSec || remainingSec === 0;

    if (remainingSec === 0) {
      setRemainingSec(totalSec);
    }

    if (mode === "focus" && !sessionEligible && isAtFullOrZero) {
      setSessionEligible(true);
    }

    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemainingSec(modeTotalSec[mode]);
    setSessionEligible(false);
  };

  const settingsDraft = useMemo(() => {
    return {
      focus: String(durationsMin.focus),
      shortBreak: String(durationsMin.shortBreak),
      longBreak: String(durationsMin.longBreak),
    };
  }, [durationsMin.focus, durationsMin.shortBreak, durationsMin.longBreak]);

  const [draft, setDraft] = useState(settingsDraft);

  useEffect(() => {
    if (!settingsOpen) return;
    setDraft(settingsDraft);
    setSettingsError(null);
  }, [settingsDraft, settingsOpen]);

  const saveSettings = () => {
    const rawFocus = Number(draft.focus);
    const rawShort = Number(draft.shortBreak);
    const rawLong = Number(draft.longBreak);

    if (
      !Number.isFinite(rawFocus) ||
      !Number.isFinite(rawShort) ||
      !Number.isFinite(rawLong) ||
      rawFocus <= 0 ||
      rawShort <= 0 ||
      rawLong <= 0
    ) {
      setSettingsError("Durations must be greater than 0 minutes.");
      return;
    }

    const nextFocus = clampToValidMinutes(rawFocus);
    const nextShort = clampToValidMinutes(rawShort);
    const nextLong = clampToValidMinutes(rawLong);

    setDurationsMin({
      focus: nextFocus,
      shortBreak: nextShort,
      longBreak: nextLong,
    });

    if (!isRunning) {
      const nextModeMinutes: Record<Mode, number> = {
        focus: nextFocus,
        shortBreak: nextShort,
        longBreak: nextLong,
      };
      setRemainingSec(toSecondsFromMinutes(nextModeMinutes[mode]));
      setSessionEligible(false);
    }
    setSettingsOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Pomodoro Timer
          </h1>
          <p className="text-sm text-slate-600">
            Focus, breaks, and a local session history.
          </p>
        </div>
        <button
          type="button"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          onClick={() => setSettingsOpen(true)}
          data-testid="settings-open"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L14.9 4h-3.8l-.4 2.4a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.6 2 3.4 2.4-1c.53.4 1.1.75 1.7 1l.4 2.4h3.8l.4-2.4c.6-.25 1.17-.6 1.7-1l2.4 1 2-3.4-2-1.6Z" />
          </svg>
        </button>
      </header>

      <div className="flex flex-col gap-4">
        <div
          className="flex w-full items-center justify-center gap-2"
          role="tablist"
          aria-label="Timer modes"
        >
          {(
            [
              { key: "focus", label: "Focus" },
              { key: "shortBreak", label: "Short Break" },
              { key: "longBreak", label: "Long Break" },
            ] as const
          ).map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? "min-h-[44px] rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    : "min-h-[44px] rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                }
                onClick={() => handleModeChange(m.key)}
                data-testid={`mode-${m.key}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <div
            className="text-sm font-medium text-slate-600"
            data-testid="mode-label"
          >
            {modeLabel(mode)}
          </div>
          <div
            className="select-none text-center font-mono text-6xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-7xl"
            data-testid="timer-display"
          >
            {formatMmSs(remainingSec)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            className="min-h-[44px] rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleStart}
            disabled={isRunning}
            data-testid="btn-start"
          >
            Start
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-lg bg-slate-100 px-4 py-3 text-base font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handlePause}
            disabled={!isRunning}
            data-testid="btn-pause"
          >
            Pause
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50"
            onClick={handleReset}
            data-testid="btn-reset"
          >
            Reset
          </button>
        </div>

        <audio
          ref={audioRef}
          data-testid="audio-end"
          preload="auto"
          src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
        />
      </div>

      <section className="border-t border-slate-200 pt-6">
        <h2 className="text-base font-semibold text-slate-900">History</h2>
        <p className="mt-1 text-sm text-slate-600">
          Completed focus sessions (most recent first).
        </p>

        <ul className="mt-4 flex flex-col gap-2" data-testid="history-list">
          {history.length === 0 ? (
            <li className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No completed focus sessions yet.
            </li>
          ) : (
            history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
                data-testid="history-item"
                data-completed-iso={entry.completedAtIso}
              >
                <span className="font-medium">Focus Session</span> completed at{" "}
                {formatCompletedAt(entry.completedAtIso)}
              </li>
            ))
          )}
        </ul>
      </section>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          data-testid="settings-modal"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Settings
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Set durations (in minutes) for each mode.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => setSettingsOpen(false)}
                data-testid="settings-close"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-800">Focus</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min={0.05}
                  step={0.05}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                  value={draft.focus}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, focus: e.target.value }))
                  }
                  data-testid="settings-focus"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-800">Short Break</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min={0.05}
                  step={0.05}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                  value={draft.shortBreak}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      shortBreak: e.target.value,
                    }))
                  }
                  data-testid="settings-short"
                />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-800">Long Break</span>
                <input
                  inputMode="decimal"
                  type="number"
                  min={0.05}
                  step={0.05}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                  value={draft.longBreak}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, longBreak: e.target.value }))
                  }
                  data-testid="settings-long"
                />
              </label>

              {settingsError ? (
                <div
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                  data-testid="settings-error"
                >
                  {settingsError}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={saveSettings}
                data-testid="settings-save"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
