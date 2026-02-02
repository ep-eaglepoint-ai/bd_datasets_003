import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TaskDTO } from "@/lib/taskTypes";

jest.mock("@/actions/tasks", () => ({
  updateTaskAction: jest.fn(),
  createTaskAction: jest.fn(),
}));

import { updateTaskAction } from "@/actions/tasks";
import { BoardClient } from "@/components/BoardClient";

type MockedUpdate = jest.MockedFunction<typeof updateTaskAction>;

function getColumn(name: string) {
  return screen.getByLabelText(name);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("Optimistic UI rolls back on conflict rejection", async () => {
  const mockedUpdate = updateTaskAction as unknown as MockedUpdate;
  const d = deferred<{
    ok: false;
    error: "CONFLICT";
    message: string;
    currentVersion: number;
  }>();
  mockedUpdate.mockReturnValue(
    d.promise as unknown as ReturnType<MockedUpdate>
  );

  const initial: TaskDTO[] = [
    {
      id: "t1",
      title: "Task 1",
      description: "",
      status: "TODO",
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  ];

  render(<BoardClient initialTasks={initial} />);

  const todoCol = getColumn("To Do");
  const inProgressCol = getColumn("In Progress");

  expect(within(todoCol).getByText("Task 1")).toBeInTheDocument();

  const moveRight = within(todoCol).getByRole("button", { name: "→" });
  await userEvent.click(moveRight);

  // Optimistic move should happen quickly
  await waitFor(() => {
    expect(within(inProgressCol).getByText("Task 1")).toBeInTheDocument();
  });

  d.resolve({
    ok: false,
    error: "CONFLICT",
    message: "Task was changed by someone else",
    currentVersion: 2,
  });

  // After server rejects, it should roll back
  await waitFor(() => {
    expect(within(todoCol).getByText("Task 1")).toBeInTheDocument();
  });

  expect(within(inProgressCol).queryByText("Task 1")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
});

test("Optimistic UI rolls back when offline/network error occurs", async () => {
  const mockedUpdate = updateTaskAction as unknown as MockedUpdate;
  const d = deferred<never>();
  mockedUpdate.mockReturnValue(
    d.promise as unknown as ReturnType<MockedUpdate>
  );

  const initial: TaskDTO[] = [
    {
      id: "t2",
      title: "Task 2",
      description: "",
      status: "TODO",
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  ];

  render(<BoardClient initialTasks={initial} />);

  const todoCol = getColumn("To Do");
  const inProgressCol = getColumn("In Progress");

  const moveRight = within(todoCol).getByRole("button", { name: "→" });
  await userEvent.click(moveRight);

  await waitFor(() => {
    expect(within(inProgressCol).getByText("Task 2")).toBeInTheDocument();
  });

  d.reject(new Error("Network offline"));

  await waitFor(() => {
    expect(within(todoCol).getByText("Task 2")).toBeInTheDocument();
  });

  expect(within(inProgressCol).queryByText("Task 2")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("offline/network");
});
