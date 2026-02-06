import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { JoinPage } from "./JoinPage";
import { OrganizationsPage } from "./OrganizationsPage";
import { DashboardPage } from "./DashboardPage";

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
