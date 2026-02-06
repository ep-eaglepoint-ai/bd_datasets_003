import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JoinPage } from "../../repository_after/client/src/JoinPage";

function renderJoin(token: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/join/${token}`]}>
        <Routes>
          <Route path="/join/:token" element={<JoinPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("JoinPage", () => {
  it("shows organization details and allows accepting a valid invitation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();

      if (url.includes("/api/join/valid-token/") && method === "GET") {
        return new Response(
          JSON.stringify({
            organization: { name: "Acme", slug: "acme" },
            email: "me@example.com",
            role: "member",
            expires_at: new Date().toISOString(),
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/join/valid-token/accept/") && method === "POST") {
        return new Response(JSON.stringify({ membership_id: 123 }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ detail: "Unexpected request" }), {
        status: 500,
      });
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    renderJoin("valid-token");

    expect(await screen.findByText("Join Acme")).toBeInTheDocument();
    expect(screen.getByText(/Invited as:/)).toHaveTextContent("member");

    const btn = screen.getByRole("button", { name: /accept invitation/i });
    btn.click();

    expect(await screen.findByText("Joined successfully")).toBeInTheDocument();
  });

  it("shows a clear error for expired invitations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Invitation expired" }), {
            status: 400,
          })
      ) as unknown as typeof fetch
    );

    renderJoin("expired-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invitation expired"
    );
  });

  it("shows a clear error for already-used invitations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Invitation already used" }), {
            status: 400,
          })
      ) as unknown as typeof fetch
    );

    renderJoin("used-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invitation already used"
    );
  });
});
