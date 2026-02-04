import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MusicPlayer from "../components/MusicPlayer";
import Controls from "../components/Controls";
import ProgressBar from "../components/ProgressBar";
import TrackProvider, { useTrack } from "../context/TrackContext";

// --- Mock Data ---
jest.mock("../data", () => {
  const tracks = Array.from({ length: 23 }, (_, i) => ({
    name: `song${i}`,
    displayName: `Song ${i}`,
    artist: `Artist ${i}`,
    audioSrc: `http://example.com/song${i}.mp3`,
    coverUrl: `http://example.com/cover${i}.jpg`,
  }));
  return { tracks };
});

// --- DOM / Global Mocks ---

// Mock CSS Animate
jest.mock("animate.css", () => ({}));

// Mock Audio
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockLoad = jest.fn();

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = mockPlay;
  window.HTMLMediaElement.prototype.pause = mockPause;
  window.HTMLMediaElement.prototype.load = mockLoad;
  // Stub duration/currentTime to be settable
  Object.defineProperty(window.HTMLMediaElement.prototype, "duration", {
    writable: true,
    value: 0,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "currentTime", {
    get() {
      return this._currentTime || 0;
    },
    set(v) {
      this._currentTime = v;
    },
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "volume", {
    writable: true,
    value: 1,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "muted", {
    writable: true,
    value: false,
  });
});

// Mock requestAnimationFrame
// We mocked it to allow manual control or auto run?
// "Mock requestAnimationFrame to control animation timing"
// We will use real timers to simulate frames or just manual firing.
// Using jest.useFakeTimers is easiest for rAF if supported, but typically rAF needs custom mock.
let rafCallbacks = new Map();
let rafIdCounter = 0;

window.requestAnimationFrame = jest.fn((cb) => {
  rafIdCounter++;
  rafCallbacks.set(rafIdCounter, cb);
  return rafIdCounter;
});

window.cancelAnimationFrame = jest.fn((id) => {
  rafCallbacks.delete(id);
});

global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;

const triggerAnimationFrame = (time) => {
  // Execute all registered callbacks
  rafCallbacks.forEach((cb, id) => {
    // rAF callback receives a timestamp
    cb(time || Date.now());
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  rafCallbacks.clear();
  // Reset Audio properties
  window.HTMLMediaElement.prototype.duration = 0;
  window.HTMLMediaElement.prototype.currentTime = 0;
  window.HTMLMediaElement.prototype.volume = 1;
  window.HTMLMediaElement.prototype.muted = false;
});

// --- Helper Components ---
const ContextSpy = () => {
  const { trackIndex, trackIndexFromList, isPlayListOpen, duration, timeProgress } = useTrack();
  // We can expose these to test via data-testid
  return (
    <div data-testid="context-spy">
      <span data-testid="val-trackIndex">{trackIndex}</span>
      <span data-testid="val-trackIndexFromList">{trackIndexFromList}</span>
      <span data-testid="val-isPlayListOpen">{isPlayListOpen.toString()}</span>
      <span data-testid="val-duration">{duration}</span>
      <span data-testid="val-timeProgress">{timeProgress}</span>
    </div>
  );
};

const renderMusicPlayer = () => {
  return render(
    <TrackProvider>
      <MusicPlayer />
      <ContextSpy />
    </TrackProvider>,
  );
};

const renderControlsOnly = () => {
  return render(
    <TrackProvider>
      <Controls />
    </TrackProvider>,
  );
};

const renderProgressBarOnly = () => {
  return render(
    <TrackProvider>
      <ProgressBar />
    </TrackProvider>,
  );
};

// --- Tests ---

describe("MusicPlayer Test Suite", () => {
  describe("Track Navigation Logic", () => {
    test("handleNext advances to next track (index 0 -> 1)", () => {
      renderMusicPlayer();
      // Buttons in Controls: Pre, SkipBack, Play, SkipFwd, Next
      // We can identify them by order or icon class if needed.
      // Controls.js order: [Prev, SkipBack, Play, SkipFwd, Next]
      const nextBtn = screen
        .getAllByRole("button", { hidden: true })
        .find((b) => b.innerHTML.includes("IoPlaySkipForwardSharp") || b.parentElement.className.includes("controls"));
      // Since getAllByRole('button') returns all buttons including Playlist and Volume, let's target .controls container
      const controlsDiv = document.querySelector(".controls");
      const buttons = controlsDiv.querySelectorAll("button");
      const nextButton = buttons[4];

      fireEvent.click(nextButton);

      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("1");
      expect(screen.getByText("Song 1")).toBeInTheDocument();
    });

    test("handleNext at last track wraps to first track (index 22 -> 0)", () => {
      renderMusicPlayer();
      const controlsDiv = document.querySelector(".controls");
      const buttons = controlsDiv.querySelectorAll("button");
      const nextButton = buttons[4];

      // Fast forward 22 times to get to end
      for (let i = 0; i < 22; i++) {
        fireEvent.click(nextButton);
      }
      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("22");

      // Click once more
      fireEvent.click(nextButton);
      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("0");
    });

    test("handlePrevious goes to previous track (index 5 -> 4)", () => {
      renderMusicPlayer();
      const controlsDiv = document.querySelector(".controls");
      const buttons = controlsDiv.querySelectorAll("button");
      const nextButton = buttons[4];
      const prevButton = buttons[0];

      // Move to 5
      for (let i = 0; i < 5; i++) {
        fireEvent.click(nextButton);
      }
      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("5");

      fireEvent.click(prevButton);
      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("4");
    });

    test("handlePrevious at first track wraps to last track (index 0 -> 22)", () => {
      renderMusicPlayer();
      const controlsDiv = document.querySelector(".controls");
      const buttons = controlsDiv.querySelectorAll("button");
      const prevButton = buttons[0];

      fireEvent.click(prevButton);
      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("22");
    });

    test("track object updates correctly after navigation", () => {
      renderMusicPlayer();
      const controlsDiv = document.querySelector(".controls");
      const nextButton = controlsDiv.querySelectorAll("button")[4];

      // Initial: Song 0
      expect(screen.getByText("Song 0")).toBeInTheDocument();

      fireEvent.click(nextButton);

      // After: Song 1
      expect(screen.getByText("Song 1")).toBeInTheDocument();
      expect(screen.queryByText("Song 0")).not.toBeInTheDocument();
    });

    test("both trackIndex AND trackIndexFromList stay synchronized", () => {
      renderMusicPlayer();
      const controlsDiv = document.querySelector(".controls");
      const nextButton = controlsDiv.querySelectorAll("button")[4];

      fireEvent.click(nextButton);

      expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("1");
      expect(screen.getByTestId("val-trackIndexFromList")).toHaveTextContent("1");
    });
  });

  describe("Playlist Selection", () => {
    test("clicking playlist item sets trackIndexFromList correctly", () => {
      renderMusicPlayer();
      // Open playlist
      const playlistBtn = document.querySelector(".playlist-button");
      fireEvent.click(playlistBtn);

      // Find playlist item 2
      const items = document.querySelectorAll(".playlist-item");
      fireEvent.click(items[2]);

      expect(screen.getByTestId("val-trackIndexFromList")).toHaveTextContent("2");
    });

    test("clicking playlist item triggers track change via useEffect", async () => {
      renderMusicPlayer();
      const playlistBtn = document.querySelector(".playlist-button");
      fireEvent.click(playlistBtn);
      const items = document.querySelectorAll(".playlist-item");

      fireEvent.click(items[5]);
      // useEffect should sync trackIndex
      await waitFor(() => {
        expect(screen.getByTestId("val-trackIndex")).toHaveTextContent("5");
      });
      expect(screen.getByRole("heading", { level: 4, name: "Song 5" })).toBeInTheDocument();
    });

    test("clicking currently playing track does NOT restart it", () => {
      renderMusicPlayer();
      const playlistBtn = document.querySelector(".playlist-button");
      fireEvent.click(playlistBtn);
      const items = document.querySelectorAll(".playlist-item");

      // Initially 0. Click 0.
      mockPlay.mockClear();
      fireEvent.click(items[0]);

      // Should not trigger play again or re-set track if guard condition works
      // The useEffect: "if (trackIndex === trackIndexFromList) return"
      // So setIsPlaying(true) won't run?
      // We need to check if play was called.
      // But if it's already playing?
      // Let's ensure it is playing first.

      // 1. Start playing
      const playBtn = document.querySelector(".controls .play-pause");
      fireEvent.click(playBtn);
      expect(mockPlay).toHaveBeenCalled();
      mockPlay.mockClear();

      // 2. Click same track in playlist
      fireEvent.click(items[0]);

      // Should NOT call play again (because no state change triggered effect)
      expect(mockPlay).not.toHaveBeenCalled();
    });

    test("selecting track from playlist auto-starts playback", () => {
      renderMusicPlayer();
      const playlistBtn = document.querySelector(".playlist-button");
      fireEvent.click(playlistBtn);
      const items = document.querySelectorAll(".playlist-item");

      // Initially not playing
      expect(mockPlay).not.toHaveBeenCalled();

      // Select track 1
      fireEvent.click(items[1]);

      // Should auto play
      // The useEffect says: if (!isPlaying) setIsPlaying(true) -> triggers audioRef.play()
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  describe("Volume Control", () => {
    test("volume change updates audioRef.current.volume correctly (0-100 map to 0.0-1.0)", () => {
      renderMusicPlayer();
      const volumeSlider = document.querySelector('.volume input[type="range"]');

      fireEvent.change(volumeSlider, { target: { value: "50" } });

      // Check the actual audio element
      const audioEl = document.querySelector("audio");
      expect(audioEl.volume).toBe(0.5);
    });

    test("mute toggle sets audioRef.current.muted to true", () => {
      renderMusicPlayer();
      const volumeDiv = document.querySelector(".volume");
      const muteBtn = volumeDiv.querySelectorAll("button")[0]; // First button

      fireEvent.click(muteBtn);

      const audioEl = document.querySelector("audio");
      expect(audioEl.muted).toBe(true);
    });

    test("unmute restores previous volume level", () => {
      // Implementation check: The code toggles `muteVolume`.
      // `audioRef.current.muted = muteVolume`.
      // It does NOT change volume value (it keeps it).
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");

      // Set volume to 80
      const volumeSlider = document.querySelector('.volume input[type="range"]');
      fireEvent.change(volumeSlider, { target: { value: "80" } });
      expect(audioEl.volume).toBe(0.8);

      // Mute
      const volumeDiv = document.querySelector(".volume");
      const muteBtn = volumeDiv.querySelectorAll("button")[0];
      fireEvent.click(muteBtn);
      expect(audioEl.muted).toBe(true);
      expect(audioEl.volume).toBe(0.8); // Volume should persist

      // Unmute
      fireEvent.click(muteBtn);
      expect(audioEl.muted).toBe(false);
      expect(audioEl.volume).toBe(0.8);
    });
  });

  describe("Progress Bar Synchronization", () => {
    const advanceTime = (audioEl, seconds) => {
      audioEl.currentTime = seconds;
      // Manually trigger the rAF callback "repeat"
      triggerAnimationFrame();
    };

    test("repeat callback updates timeProgress from audio currentTime", async () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      // Trigger loadedmetadata to set duration
      Object.defineProperty(audioEl, "duration", { value: 200, writable: true });
      fireEvent.loadedMetadata(audioEl);

      // Start playing to trigger loop
      const playBtn = document.querySelector(".controls .play-pause");
      fireEvent.click(playBtn);

      await waitFor(() => {
        expect(window.requestAnimationFrame).toHaveBeenCalled();
      });

      const rafCallback =
        window.requestAnimationFrame.mock.calls[window.requestAnimationFrame.mock.calls.length - 1]?.[0];
      expect(rafCallback).toBeDefined();

      // Move time
      act(() => {
        audioEl.currentTime = 50;
        rafCallback(Date.now());
      });

      await waitFor(
        () => {
          expect(screen.getByTestId("val-timeProgress")).toHaveTextContent("50");
        },
        { timeout: 3000 },
      );

      const progressBar = document.querySelector('.progress-bar-container input[type="range"]');
      expect(progressBar.value).toBe("50");
    });

    test("division by zero handling when duration is 0", () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      // Set duration 0
      Object.defineProperty(audioEl, "duration", { value: 0, writable: true });
      fireEvent.loadedMetadata(audioEl);

      // Start playing
      const playBtn = document.querySelector(".controls .play-pause");
      fireEvent.click(playBtn);

      // Should not crash.
      // Check calling repeat
      try {
        advanceTime(audioEl, 0);
      } catch (e) {
        // Should not happen
      }

      // Check style
      // Controls.js: `progressBarRef.current.style.setProperty('--range-progress', ...)`
      const range = document.querySelector('.progress-bar-container input[type="range"]');
      const style = range.style.getPropertyValue("--range-progress");

      // If duration is 0, currentTime/duration is NaN.
      // We expect the code to handle it or CSS to accept "NaN%" (which is invalid but doesn't crash JS usually).
      // But optimal behavior is to check if it crashed or if it set something weird.
      // If the test passes without error, good.
      // But we can check if it produced "NaN%".
      // If requirement says "must be handled", getting NaN% usually implies NOT handled.
      // So we might assert it is '0%' or similar if we want to enforce fix.
      // "Criteria 7: ... Division by zero must be handled"
      // So we expect it NOT to be NaN%.
      expect(style).not.toContain("NaN");
      expect(style).not.toContain("Infinity");
    });
  });

  describe("Skip Forward/Backward", () => {
    test("skipForward adds exactly 10 seconds", () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      Object.defineProperty(audioEl, "duration", { value: 200, writable: true });
      fireEvent.loadedMetadata(audioEl);
      audioEl.currentTime = 50;

      const controlsDiv = document.querySelector(".controls");
      const skipFwdBtn = controlsDiv.querySelectorAll("button")[3];

      fireEvent.click(skipFwdBtn);
      expect(audioEl.currentTime).toBe(60);
    });

    test("skipBackward subtracts exactly 10 seconds", () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      Object.defineProperty(audioEl, "duration", { value: 200, writable: true });
      fireEvent.loadedMetadata(audioEl);
      audioEl.currentTime = 50;

      const controlsDiv = document.querySelector(".controls");
      const skipBackBtn = controlsDiv.querySelectorAll("button")[1];

      fireEvent.click(skipBackBtn);
      expect(audioEl.currentTime).toBe(40);
    });

    test("skip backward does not go below 0", () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      audioEl.currentTime = 5;

      const controlsDiv = document.querySelector(".controls");
      const skipBackBtn = controlsDiv.querySelectorAll("button")[1];

      fireEvent.click(skipBackBtn);

      // If component does `currentTime -= 10` -> -5.
      // Expectation
      expect(audioEl.currentTime).toBe(0);
    });

    test("skip forward does not exceed duration", () => {
      renderMusicPlayer();
      const audioEl = document.querySelector("audio");
      Object.defineProperty(audioEl, "duration", { value: 100, writable: true });
      fireEvent.loadedMetadata(audioEl);
      audioEl.currentTime = 95;

      const controlsDiv = document.querySelector(".controls");
      const skipFwdBtn = controlsDiv.querySelectorAll("button")[3];

      fireEvent.click(skipFwdBtn);

      expect(audioEl.currentTime).toBe(100);
    });
  });

  describe("Edge Cases", () => {
    test("initial render with null audioRef handles null checks", () => {
      // This is hard to "prove" via blackbox other than it doesn't crash.
      // But we can check console.error?
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      renderMusicPlayer();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test("requestAnimationFrame cancelled on unmount", async () => {
      const { unmount } = renderMusicPlayer();

      // Start playing to trigger rAF
      const playBtn = document.querySelector(".controls .play-pause");
      fireEvent.click(playBtn);

      await waitFor(() => {
        expect(window.requestAnimationFrame).toHaveBeenCalled();
      });
      act(() => {
        unmount();
      });
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("Null audioRef Guards", () => {
    test("skipBackward/skipForward return early when audioRef is null", () => {
      renderControlsOnly();
      const controlsDiv = document.querySelector(".controls");
      const skipBackBtn = controlsDiv.querySelectorAll("button")[1];
      const skipFwdBtn = controlsDiv.querySelectorAll("button")[3];

      expect(() => fireEvent.click(skipBackBtn)).not.toThrow();
      expect(() => fireEvent.click(skipFwdBtn)).not.toThrow();
    });

    test("progress bar change returns early when audioRef is null", () => {
      renderProgressBarOnly();
      const range = document.querySelector('.progress-bar-container input[type="range"]');

      expect(() => fireEvent.change(range, { target: { value: "10" } })).not.toThrow();
    });
  });
});
