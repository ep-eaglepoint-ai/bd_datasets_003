import React from "react";
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { JoinPage } from "./JoinPage";
import { OrganizationsPage } from "./OrganizationsPage";
import { DashboardPage } from "./DashboardPage";

const PERSIST_KEY = "rq-cache";

function loadPersistedState() {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function persistClient(client: QueryClient) {
  if (typeof window === "undefined") return;
  let timeout: number | undefined;

  const save = () => {
    try {
      const state = dehydrate(client);
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
    } catch {
      // best-effort only
    }
  };

  client.getQueryCache().subscribe(() => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(save, 200);
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      networkMode: "offlineFirst",
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const persisted = loadPersistedState();
if (persisted) {
  try {
    hydrate(queryClient, persisted);
  } catch {
    // ignore corrupted state
  }
}
persistClient(queryClient);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OrganizationsPage />} />
          <Route
            path="/organizations/:organizationSlug/dashboard"
            element={<DashboardPage />}
          />
          <Route path="/join/:token" element={<JoinPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
