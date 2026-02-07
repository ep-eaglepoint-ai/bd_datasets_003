export class APIError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

export async function apiFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const isSafe = method === "GET" || method === "HEAD" || method === "OPTIONS";
  // Offline strategy: allow safe reads so React Query can serve cached data.
  // Block mutating requests explicitly when offline.
  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false &&
    !isSafe
  ) {
    throw new APIError("Offline");
  }

  const res = await fetch(url, { credentials: "include", ...(init || {}) });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data?.detail) msg = data.detail;
    } catch {
      // ignore
    }
    throw new APIError(msg, res.status);
  }
  return (await res.json()) as T;
}
