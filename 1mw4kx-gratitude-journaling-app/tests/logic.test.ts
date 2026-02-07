import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "path";

const REPO_NAME = process.env.TARGET_REPO || "repository_after";
const statsPath = path.resolve(__dirname, `../${REPO_NAME}/app/routes/stats.tsx`);

let loaderModule: any = null;

// Format dates to YYYY-MM-DD consistently
function formatDate(date: Date) {
    return date.toISOString().split("T")[0];
}

// Create a mock entry
function makeEntry(id: number, date: Date, item1 = "Test", item2 = "", item3 = "") {
    return { id, date: formatDate(date), item1, item2, item3 };
}

beforeAll(async () => {
    // Mock session
    vi.doMock("~/utils/session.server", () => ({
        getSession: vi.fn(async () => ({
            get: (key: string) => (key === "userId" ? 1 : null),
        })),
    }));

    // Mock Prisma
    vi.doMock("~/utils/prisma.server", () => ({
        prisma: {
            entry: {
                findMany: vi.fn(async () => []),
                findUnique: vi.fn(async () => null),
                upsert: vi.fn(async () => ({})),
            },
            user: {
                findUnique: vi.fn(async () => null),
                update: vi.fn(async () => ({})),
            },
        },
    }));

    // Import loader dynamically
    loaderModule = await import(/* @vite-ignore */ statsPath);
});

describe(`Gratitude Journal Logic (${REPO_NAME})`, () => {
    const makeRequest = () =>
        new Request("http://localhost/stats", { headers: { Cookie: "session=valid" } });

    it("Streak Calculation Algorithm: should return 0 streak for empty input", async () => {
        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([]);
        const result: any = await loaderModule.loader({ request: makeRequest() } as any);
        expect(result.currentStreak).toBe(0);
        expect(result.longestStreak).toBe(0);
    });

    it("Streak Calculation Algorithm: should count today as streak 1", async () => {
        const today = new Date();
        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([makeEntry(1, today)]);
        const result: any = await loaderModule.loader({ request: makeRequest() } as any);
        expect(result.currentStreak).toBe(1);
        expect(result.longestStreak).toBe(1);
    });

    it("Streak Calculation Algorithm: should count yesterday as streak 1 (grace period active)", async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([makeEntry(1, yesterday)]);
        const result: any = await loaderModule.loader({ request: makeRequest() } as any);
        expect(result.currentStreak).toBe(1);
        expect(result.longestStreak).toBe(1);
    });

    it("should break streak if gap is larger than 1 day", async () => {
        const today = new Date();
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(today.getDate() - 2);

        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([
            makeEntry(1, twoDaysAgo, "Coffee"),
            makeEntry(2, today, "Sunshine"),
        ]);

        const result: any = await loaderModule.loader({ request: makeRequest() } as any);
        expect(result.currentStreak).toBe(1); // Only today counts
        expect(result.longestStreak).toBe(1); // Gap breaks streak
    });

    it("should calculate multi-day streaks correctly", async () => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(today.getDate() - 2);

        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([
            makeEntry(1, twoDaysAgo, "Coffee"),
            makeEntry(2, yesterday, "Tea"),
            makeEntry(3, today, "Sunshine"),
        ]);

        const result: any = await loaderModule.loader({ request: makeRequest() } as any);
        expect(result.currentStreak).toBe(3);
        expect(result.longestStreak).toBe(3);
    });

    it("Heatmap Generation: should return 365 days of data", async () => {
        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([]);
        const result: any = await loaderModule.loader({ request: makeRequest() } as any);

        expect(result.heatmap.length).toBe(365);
        expect(result.heatmap[364].hasEntry).toBe(false);
    });

    it("Word Analysis Algorithm: should count valid words and map them to entries", async () => {
        const today = new Date();
        const prisma = (await import("~/utils/prisma.server")).prisma;
        (prisma.entry.findMany as any).mockResolvedValue([
            makeEntry(1, today, "Coffee is amazing", "Sunshine"),
            makeEntry(2, today, "Amazing coffee today"),
        ]);

        const result: any = await loaderModule.loader({ request: makeRequest() } as any);

        const wordCounts = result.topWords.reduce((acc: any, [word, count]: any) => {
            acc[word] = count;
            return acc;
        }, {});

        expect(wordCounts["coffee"]).toBe(2);
        expect(wordCounts["amazing"]).toBe(2);
        expect(result.wordToEntries["coffee"].length).toBe(2);

        // Verify stop words are filtered out (e.g., 'is' should not be in topWords)
        const words = result.topWords.map(([w]: any) => w);
        expect(words).not.toContain("is");
        expect(words).not.toContain("the");
    });
});

describe(`Auth & Home Logic (${REPO_NAME})`, () => {
    let authModule: any = null;
    let homeModule: any = null;

    beforeAll(async () => {
        const callbackPath = path.resolve(__dirname, `../${REPO_NAME}/app/routes/auth.callback.tsx`);
        const homePath = path.resolve(__dirname, `../${REPO_NAME}/app/routes/home.tsx`);
        authModule = await import(/* @vite-ignore */ callbackPath);
        homeModule = await import(/* @vite-ignore */ homePath);
    });

    const makeRequest = (url: string) => new Request(url, { headers: { Cookie: "session=valid" } });

    it("Auth Callback: should reject expired tokens", async () => {
        const prisma = (await import("~/utils/prisma.server")).prisma;

        // Mock user with expired token
        (prisma.user.findUnique as any).mockResolvedValue({
            id: 1,
            email: "test@example.com",
            magicToken: "123",
            tokenExpiry: new Date(Date.now() - 10000), // Expired 10s ago
        });

        const request = makeRequest("http://localhost/auth/callback?token=123&email=test@example.com");

        try {
            await authModule.loader({ request });
        } catch (response: any) {
            // Remix redirects by throwing/returning a Response
            expect(response.status).toBe(302);
            expect(response.headers.get("Location")).toBe("/login");
        }
    });

    it("Home Loader: 'On This Day' should only match 1 year ago exactly", async () => {
        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const twoYearsAgo = new Date(today);
        twoYearsAgo.setFullYear(today.getFullYear() - 2);

        const prisma = (await import("~/utils/prisma.server")).prisma;

        // Mock findUnique (Today's entry - null)
        (prisma.entry.findUnique as any).mockResolvedValue(null);

        // Mock findMany (Past entries)
        (prisma.entry.findMany as any).mockResolvedValue([
            { id: 1, date: oneYearAgo, item1: "One Year Ago" },
            { id: 2, date: twoYearsAgo, item1: "Two Years Ago" }
        ]);

        const result = await homeModule.loader({ request: makeRequest("http://localhost/") });

        expect(result.onThisDay).not.toBeNull();
        expect(new Date(result.onThisDay.date).getFullYear()).toBe(today.getFullYear() - 1);
        // Should NOT pick the 2 year ago one, even if it exists
        expect(result.onThisDay.item1).toBe("One Year Ago");
    });
});
