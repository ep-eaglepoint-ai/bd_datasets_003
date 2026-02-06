/**
 * @jest-environment jsdom
 */
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import TaskDashboard from "@/components/TaskDashboard";
import axios from "axios";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("TaskDashboard", () => {
  const mockTasks = [
    {
      id: "1",
      taskId: "task-1",
      payload: { key: "value" },
      status: "PENDING" as const,
      result: null,
      attempts: 0,
      createdAt: new Date().toISOString(),
      errorMessage: null,
      logs: [],
    },
    {
      id: "2",
      taskId: "task-2",
      payload: { key: "val2" },
      status: "COMPLETED" as const,
      result: { success: true },
      attempts: 1,
      createdAt: new Date().toISOString(),
      errorMessage: null,
      logs: [],
    },
    {
      id: "3",
      taskId: "task-3",
      payload: { key: "val3" },
      status: "FAILED" as const,
      result: null,
      attempts: 3,
      createdAt: new Date().toISOString(),
      errorMessage: "Test error",
      logs: [],
    },
    {
      id: "4",
      taskId: null,
      payload: { key: "val4" },
      status: "PENDING" as const,
      result: null,
      attempts: 0,
      createdAt: new Date().toISOString(),
      errorMessage: null,
      logs: [],
    },
    {
      id: "5",
      taskId: "task-5",
      payload: { key: "val5" },
      status: "PROCESSING" as const,
      result: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      errorMessage: null,
      logs: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [] });
  });

  it("renders the dashboard title", async () => {
    await act(async () => {
      render(<TaskDashboard />);
    });
    expect(
      screen.getByText("Exactly-Once Processing Simulator"),
    ).toBeInTheDocument();
  });

  it("fetches and displays tasks", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText("task-1")).toBeInTheDocument();
      expect(screen.getByText("task-2")).toBeInTheDocument();
    });
  });

  it("handles fetch error gracefully", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      render(<TaskDashboard />);
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("submits a new task successfully", async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 201, data: mockTasks[0] });

    await act(async () => {
      render(<TaskDashboard />);
    });

    const input = screen.getByPlaceholderText("e.g. order-123");
    fireEvent.change(input, { target: { value: "new-task" } });

    const button = screen.getByRole("button", { name: "Submit Task" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/tasks", {
      taskId: "new-task",
      payload: { key: "value" },
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it("handles duplicate/idempotent submission", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: mockTasks[0] });

    await act(async () => {
      render(<TaskDashboard />);
    });

    const button = screen.getByRole("button", { name: "Submit Task" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(alertMock).toHaveBeenCalledWith("Task exists (Idempotent)!");
    alertMock.mockRestore();
  });

  it("handles invalid JSON payload", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});

    await act(async () => {
      render(<TaskDashboard />);
    });

    const textarea = screen.getByLabelText("Payload (JSON)");
    fireEvent.change(textarea, { target: { value: "{invalid" } });

    const button = screen.getByRole("button", { name: "Submit Task" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(alertMock).toHaveBeenCalledWith("Invalid JSON payload");
    expect(mockedAxios.post).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });

  it("handles submission error with error message", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { error: "Submission failed" } },
    });

    await act(async () => {
      render(<TaskDashboard />);
    });

    const button = screen.getByRole("button", { name: "Submit Task" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(alertMock).toHaveBeenCalledWith("Submission failed");
    alertMock.mockRestore();
  });

  it("handles submission error without response data", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockedAxios.post.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      render(<TaskDashboard />);
    });

    const button = screen.getByRole("button", { name: "Submit Task" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(alertMock).toHaveBeenCalledWith("Network error");
    alertMock.mockRestore();
  });

  it("handles manual processing", async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200 });

    await act(async () => {
      render(<TaskDashboard />);
    });

    const button = screen.getByText("Run Processing Worker");
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockedAxios.post).toHaveBeenCalledWith("/api/process");
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it("handles processing error gracefully", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    mockedAxios.post.mockRejectedValueOnce(new Error("Processing failed"));

    await act(async () => {
      render(<TaskDashboard />);
    });

    const button = screen.getByText("Run Processing Worker");
    await act(async () => {
      fireEvent.click(button);
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("filters tasks by PENDING status", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(6); // Header + 5 tasks
    });

    const pendingFilter = screen.getByText("Pending", { selector: "button" });

    await act(async () => {
      fireEvent.click(pendingFilter);
    });

    expect(screen.getByText("task-1")).toBeInTheDocument();
    expect(screen.queryByText("task-2")).not.toBeInTheDocument();
  });

  it("filters tasks by COMPLETED status", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(6);
    });

    const completedFilter = screen.getByText("Completed", {
      selector: "button",
    });

    await act(async () => {
      fireEvent.click(completedFilter);
    });

    expect(screen.getByText("task-2")).toBeInTheDocument();
    expect(screen.queryByText("task-1")).not.toBeInTheDocument();
  });

  it("filters tasks by FAILED status", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(6);
    });

    const failedFilter = screen.getByText("Failed", { selector: "button" });

    await act(async () => {
      fireEvent.click(failedFilter);
    });

    expect(screen.getByText("task-3")).toBeInTheDocument();
    expect(screen.queryByText("task-1")).not.toBeInTheDocument();
  });

  it("shows all tasks when ALL filter is clicked", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(6);
    });

    // First filter to something else
    const pendingFilter = screen.getByText("Pending", { selector: "button" });
    await act(async () => {
      fireEvent.click(pendingFilter);
    });

    // Then click ALL
    const allFilter = screen.getByText("All", { selector: "button" });
    await act(async () => {
      fireEvent.click(allFilter);
    });

    expect(screen.getByText("task-1")).toBeInTheDocument();
    expect(screen.getByText("task-2")).toBeInTheDocument();
    expect(screen.getByText("task-3")).toBeInTheDocument();
  });

  it("displays tasks with null taskId as '-'", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      // Task 4 has null taskId, should display as "-"
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  it("displays PROCESSING status correctly", async () => {
    mockedAxios.get.mockResolvedValue({ data: mockTasks });

    await act(async () => {
      render(<TaskDashboard />);
    });

    await waitFor(() => {
      // Task 5 has PROCESSING status
      expect(screen.getByText("PROCESSING")).toBeInTheDocument();
    });
  });
});
