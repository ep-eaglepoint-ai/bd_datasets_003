import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "../../repository_after/client/src/Dashboard";

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("Dashboard", () => {
  it("shows a loading skeleton while fetching", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
    );

    renderWithQuery(<Dashboard organizationSlug="acme" />);

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows an offline notice when navigator is offline", () => {
    const nav = window.navigator as unknown as Record<string, unknown>;
    const hadOwn = Object.prototype.hasOwnProperty.call(nav, "onLine");
    const originalOwn = hadOwn
      ? Object.getOwnPropertyDescriptor(nav, "onLine")
      : undefined;

    Object.defineProperty(nav, "onLine", {
      configurable: true,
      get: () => false,
    });

    try {
      renderWithQuery(<Dashboard organizationSlug="acme" />);

      expect(
        screen.getByText(/You’re offline\. Showing cached data if available\./)
      ).toBeInTheDocument();
    } finally {
      if (originalOwn) {
        Object.defineProperty(nav, "onLine", originalOwn);
      } else {
        // Remove our injected own-property so JSDOM falls back to its default.
        delete (nav as { onLine?: unknown }).onLine;
      }
    }
  });

  it("renders metrics once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              organization: { slug: "acme", name: "Acme" },
              total_projects: 3,
              active_users: 2,
              latest_project_created_at: new Date(
                "2026-02-01T12:00:00Z"
              ).toISOString(),
              generated_at: new Date("2026-02-01T12:00:01Z").toISOString(),
              activity_trends: [{ day: new Date().toISOString(), count: 1 }],
            }),
            { status: 200 }
          )
      ) as unknown as typeof fetch
    );

    renderWithQuery(<Dashboard organizationSlug="acme" />);

    expect(await screen.findByText("Acme Dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Latest project created:/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
