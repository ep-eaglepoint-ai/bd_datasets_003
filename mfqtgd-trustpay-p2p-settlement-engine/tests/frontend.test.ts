import { describe, expect, it, vi } from "vitest";

// Import App normally (it resolves React deps via the frontend project)
import App from "../repository_after/frontend/src/App";

// Import ReactDOM client via an explicit path so module resolution doesn't depend on a root node_modules.
// This keeps the test file in the repo root `tests/` folder as requested.
// eslint-disable-next-line import/no-unresolved
import { createRoot } from "../repository_after/frontend/node_modules/react-dom/client";
// eslint-disable-next-line import/no-unresolved
import { createElement } from "../repository_after/frontend/node_modules/react";

function mockUsersResponse(balanceCents: number) {
  return {
    users: [
      { id: "payer", name: "Payer", active: true, balanceCents },
      { id: "p1", name: "P1", active: true, balanceCents: 0 },
      { id: "p2", name: "P2", active: true, balanceCents: 0 },
    ],
  };
}

describe("TrustPay frontend (root tests/)", () => {
  it("renders the wizard header after users load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("/api/users")) {
          return new Response(JSON.stringify(mockUsersResponse(10000)), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: "HTTP_ERROR", message: "Unexpected" } }), { status: 500 });
      }),
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(createElement(App));

    // Let effects flush
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).toContain("TrustPay Social Ledger");
    root.unmount();
  });
});

