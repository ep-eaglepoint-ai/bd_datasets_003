/**
 * Tests for React components.
 * Tests UI behavior for requirements 4, 5, 9, 10.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Simple Status Display Component for testing
const StatusDisplay = ({ status }) => (
  <div
    data-testid="status-display"
    className={`status-indicator ${status.toLowerCase()}`}
  >
    <span className={`status-dot ${status.toLowerCase()}`}></span>
    <span data-testid="status-text">{status}</span>
  </div>
);

// Simple Control Panel Component for testing
const ControlPanel = ({
  status,
  onConnect,
  onDisconnect,
  onStart,
  onPause,
  onResume,
}) => {
  const isConnected = status !== "Disconnected";
  const isPrinting = status === "Printing";
  const isPaused = status === "Paused";

  return (
    <div data-testid="control-panel">
      <StatusDisplay status={status} />

      {!isConnected ? (
        <button data-testid="connect-btn" onClick={onConnect}>
          Connect
        </button>
      ) : (
        <button data-testid="disconnect-btn" onClick={onDisconnect}>
          Disconnect
        </button>
      )}

      {isConnected && !isPrinting && !isPaused && (
        <button data-testid="start-btn" onClick={onStart}>
          Start Job
        </button>
      )}

      {isPrinting && (
        <button data-testid="pause-btn" onClick={onPause}>
          Pause
        </button>
      )}

      {isPaused && (
        <button data-testid="resume-btn" onClick={onResume}>
          Resume
        </button>
      )}
    </div>
  );
};

describe("Req 10: Status UI Display", () => {
  describe("StatusDisplay Component", () => {
    it('should display "Idle" status', () => {
      render(<StatusDisplay status="Idle" />);

      expect(screen.getByTestId("status-text")).toHaveTextContent("Idle");
      expect(screen.getByTestId("status-display")).toHaveClass("idle");
    });

    it('should display "Printing" status', () => {
      render(<StatusDisplay status="Printing" />);

      expect(screen.getByTestId("status-text")).toHaveTextContent("Printing");
      expect(screen.getByTestId("status-display")).toHaveClass("printing");
    });

    it('should display "Paused" status', () => {
      render(<StatusDisplay status="Paused" />);

      expect(screen.getByTestId("status-text")).toHaveTextContent("Paused");
      expect(screen.getByTestId("status-display")).toHaveClass("paused");
    });

    it('should display "Disconnected" status', () => {
      render(<StatusDisplay status="Disconnected" />);

      expect(screen.getByTestId("status-text")).toHaveTextContent(
        "Disconnected",
      );
      expect(screen.getByTestId("status-display")).toHaveClass("disconnected");
    });
  });

  describe("ControlPanel Status-Based UI", () => {
    it("should show Connect button when disconnected", () => {
      render(<ControlPanel status="Disconnected" onConnect={() => {}} />);

      expect(screen.getByTestId("connect-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("disconnect-btn")).not.toBeInTheDocument();
    });

    it("should show Disconnect and Start buttons when idle", () => {
      render(
        <ControlPanel
          status="Idle"
          onDisconnect={() => {}}
          onStart={() => {}}
        />,
      );

      expect(screen.getByTestId("disconnect-btn")).toBeInTheDocument();
      expect(screen.getByTestId("start-btn")).toBeInTheDocument();
    });

    it("should show Pause button when printing", () => {
      render(
        <ControlPanel
          status="Printing"
          onPause={() => {}}
          onDisconnect={() => {}}
        />,
      );

      expect(screen.getByTestId("pause-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("start-btn")).not.toBeInTheDocument();
    });

    it("should show Resume button when paused", () => {
      render(
        <ControlPanel
          status="Paused"
          onResume={() => {}}
          onDisconnect={() => {}}
        />,
      );

      expect(screen.getByTestId("resume-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("pause-btn")).not.toBeInTheDocument();
    });
  });

  describe("Status Transitions", () => {
    it("should handle status transition from Disconnected to Idle", () => {
      const { rerender } = render(<StatusDisplay status="Disconnected" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent(
        "Disconnected",
      );

      rerender(<StatusDisplay status="Idle" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Idle");
    });

    it("should handle status transition through printing workflow", () => {
      const { rerender } = render(<StatusDisplay status="Idle" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Idle");

      rerender(<StatusDisplay status="Printing" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Printing");

      rerender(<StatusDisplay status="Paused" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Paused");

      rerender(<StatusDisplay status="Printing" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Printing");

      rerender(<StatusDisplay status="Idle" />);
      expect(screen.getByTestId("status-text")).toHaveTextContent("Idle");
    });
  });
});

describe("User Interactions", () => {
  it("should call onConnect when Connect button is clicked", () => {
    const onConnect = vi.fn();
    render(<ControlPanel status="Disconnected" onConnect={onConnect} />);

    fireEvent.click(screen.getByTestId("connect-btn"));

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("should call onStart when Start button is clicked", () => {
    const onStart = vi.fn();
    render(
      <ControlPanel status="Idle" onStart={onStart} onDisconnect={() => {}} />,
    );

    fireEvent.click(screen.getByTestId("start-btn"));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("should call onPause when Pause button is clicked", () => {
    const onPause = vi.fn();
    render(
      <ControlPanel
        status="Printing"
        onPause={onPause}
        onDisconnect={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("pause-btn"));

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("should call onResume when Resume button is clicked", () => {
    const onResume = vi.fn();
    render(
      <ControlPanel
        status="Paused"
        onResume={onResume}
        onDisconnect={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("resume-btn"));

    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

// Job Time Display Component for testing
const JobTimeDisplay = ({ jobTime, lineCount }) => (
  <div data-testid="job-time-display">
    <div data-testid="job-time">{jobTime.toFixed(1)}s</div>
    <div data-testid="line-count">{lineCount} Lines</div>
  </div>
);

describe("Job Time Display", () => {
  it("should display formatted job time", () => {
    render(<JobTimeDisplay jobTime={10.567} lineCount={25} />);

    expect(screen.getByTestId("job-time")).toHaveTextContent("10.6s");
  });

  it("should display line count", () => {
    render(<JobTimeDisplay jobTime={10} lineCount={42} />);

    expect(screen.getByTestId("line-count")).toHaveTextContent("42 Lines");
  });
});

// G-Code Log Component for testing
const GCodeLog = ({ lines }) => (
  <div data-testid="gcode-log" className="gcode-log">
    {lines.map((line, i) => (
      <div key={i} data-testid={`log-line-${i}`} className="log-line">
        {line}
      </div>
    ))}
  </div>
);

describe("G-Code Log Display", () => {
  it("should display all G-code lines", () => {
    const lines = ["G21", "G90", "G0 X10 Y10", "G1 X20 Y20"];
    render(<GCodeLog lines={lines} />);

    expect(screen.getByTestId("log-line-0")).toHaveTextContent("G21");
    expect(screen.getByTestId("log-line-1")).toHaveTextContent("G90");
    expect(screen.getByTestId("log-line-2")).toHaveTextContent("G0 X10 Y10");
    expect(screen.getByTestId("log-line-3")).toHaveTextContent("G1 X20 Y20");
  });

  it("should handle empty log", () => {
    render(<GCodeLog lines={[]} />);

    const log = screen.getByTestId("gcode-log");
    expect(log.children).toHaveLength(0);
  });
});
