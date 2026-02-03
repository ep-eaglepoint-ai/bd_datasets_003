"use client";

import { useState, useEffect } from "react";
import axios from "axios";

type Task = {
  id: string;
  taskId: string | null;
  payload: any;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  result: any;
  attempts: number;
  createdAt: string;
  errorMessage: string | null;
  logs: any[];
};

export default function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [customTaskId, setCustomTaskId] = useState("");
  const [payloadStr, setPayloadStr] = useState('{"key": "value"}');
  const [filter, setFilter] = useState("ALL");

  const fetchTasks = async () => {
    try {
      const res = await axios.get("/api/tasks");
      setTasks(res.data);
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let payload;
      try {
        payload = JSON.parse(payloadStr);
      } catch (err) {
        alert("Invalid JSON payload");
        return;
      }

      const res = await axios.post("/api/tasks", {
        taskId: customTaskId || undefined,
        payload,
      });

      if (res.status === 200) {
        alert("Task exists (Idempotent)!");
      }
      fetchTasks();
      setCustomTaskId("");
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleProcess = async () => {
    try {
      await axios.post("/api/process");
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTasks = tasks.filter(
    (t) => filter === "ALL" || t.status === filter,
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">
        Exactly-Once Processing Simulator
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-semibold mb-4">Submit Task</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="taskId"
                className="block text-sm font-medium mb-1"
              >
                Task ID (Optional, Unique)
              </label>
              <input
                id="taskId"
                type="text"
                value={customTaskId}
                onChange={(e) => setCustomTaskId(e.target.value)}
                className="w-full border p-2 rounded"
                placeholder="e.g. order-123"
              />
            </div>
            <div>
              <label
                htmlFor="payload"
                className="block text-sm font-medium mb-1"
              >
                Payload (JSON)
              </label>
              <textarea
                id="payload"
                value={payloadStr}
                onChange={(e) => setPayloadStr(e.target.value)}
                className="w-full border p-2 rounded h-24"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Submit Task
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded shadow border">
          <h2 className="text-xl font-semibold mb-4">Controls</h2>
          <p className="mb-4 text-gray-600">
            For simulation, submit tasks and then manually trigger processing
            (the worker) or wait if auto-processing is enabled. In this demo,
            click "Process Pending" to simulate a worker run.
          </p>
          <button
            onClick={handleProcess}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full mb-4"
          >
            Run Processing Worker
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1 rounded ${filter === "ALL" ? "bg-gray-800 text-white" : "bg-gray-200"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("PENDING")}
              className={`px-3 py-1 rounded ${filter === "PENDING" ? "bg-yellow-500 text-white" : "bg-gray-200"}`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter("COMPLETED")}
              className={`px-3 py-1 rounded ${filter === "COMPLETED" ? "bg-green-500 text-white" : "bg-gray-200"}`}
            >
              Completed
            </button>
            <button
              onClick={() => setFilter("FAILED")}
              className={`px-3 py-1 rounded ${filter === "FAILED" ? "bg-red-500 text-white" : "bg-gray-200"}`}
            >
              Failed
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID / TaskID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Attempts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Result / Error
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created At
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTasks.map((task) => (
              <tr key={task.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex flex-col">
                    <span>{task.taskId || "-"}</span>
                    <span className="text-gray-400 text-xs">{task.id}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${
                      task.status === "COMPLETED"
                        ? "bg-green-100 text-green-800"
                        : task.status === "FAILED"
                          ? "bg-red-100 text-red-800"
                          : task.status === "PROCESSING"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {task.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.attempts}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                  {task.errorMessage ? (
                    <span className="text-red-500">{task.errorMessage}</span>
                  ) : (
                    JSON.stringify(task.result)
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(task.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No tasks found. Submit one!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
