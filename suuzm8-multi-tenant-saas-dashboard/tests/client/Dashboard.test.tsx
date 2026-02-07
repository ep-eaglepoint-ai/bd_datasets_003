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

  it("renders cached dashboard data while offline (read operations)", async () => {
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
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      client.setQueryData(["dashboard", "acme"], {
        organization: { slug: "acme", name: "Acme" },
        total_projects: 9,
        active_users: 4,
        latest_project_created_at: null,
        generated_at: new Date("2026-02-01T12:00:01Z").toISOString(),
        activity_trends: [],
      });

      // If fetch is called while offline, fail the test.
      vi.stubGlobal("fetch", vi.fn(() => {
        throw new Error("fetch should not be called when cached data exists");
      }) as unknown as typeof fetch);

      render(
        <QueryClientProvider client={client}>
          <Dashboard organizationSlug="acme" />
        </QueryClientProvider>
      );

      expect(await screen.findByText("Acme Dashboard")).toBeInTheDocument();
      expect(screen.getByText("9")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    } finally {
      if (originalOwn) {
        Object.defineProperty(nav, "onLine", originalOwn);
      } else {
        delete (nav as { onLine?: unknown }).onLine;
      }
    }
  });

  it("formats timestamps using the provided timezone", async () => {
    const originalDTF = Intl.DateTimeFormat;
    const seen: Array<{ timeZone?: string }> = [];

    // Stub DateTimeFormat to capture options.timeZone.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = function (_locale?: any, options?: any) {
      seen.push({ timeZone: options?.timeZone });
      return { format: () => "formatted" };
    } as unknown as typeof Intl.DateTimeFormat;

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                organization: { slug: "acme", name: "Acme" },
                total_projects: 1,
                active_users: 1,
                latest_project_created_at: new Date(
                  "2026-02-01T12:00:00Z"
                ).toISOString(),
                generated_at: new Date("2026-02-01T12:00:01Z").toISOString(),
                activity_trends: [],
              }),
              { status: 200 }
            )
        ) as unknown as typeof fetch
      );

      renderWithQuery(
        <Dashboard organizationSlug="acme" timeZone="America/New_York" />
      );

      expect(await screen.findByText("Acme Dashboard")).toBeInTheDocument();
      expect(screen.getByText("formatted")).toBeInTheDocument();
      expect(seen.some((o) => o.timeZone === "America/New_York")).toBe(true);
    } finally {
      Intl.DateTimeFormat = originalDTF;
    }
  });

  it("renders a clear error when the dashboard request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Server down" }), {
            status: 500,
            statusText: "Internal Server Error",
          })
      ) as unknown as typeof fetch
    );

    renderWithQuery(<Dashboard organizationSlug="acme" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
  });
});
