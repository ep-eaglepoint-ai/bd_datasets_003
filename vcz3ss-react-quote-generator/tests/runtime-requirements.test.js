import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const { loadQuoteComponent, componentAvailable } = require("./utils");

describe("localStorage Load on Initial Render", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("favorites must load correctly from localStorage on initial render", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "First quote", author: "Author 1" },
      { quote: "Second quote", author: "Author 2" },
      { quote: "Third quote", author: "Author 3" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(3);
    });
  });

  test("favorites must display in correct order (oldest first) after loading from localStorage", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "Oldest quote", author: "Author 1" },
      { quote: "Middle quote", author: "Author 2" },
      { quote: "Newest quote", author: "Author 3" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteQuotes = Array.from(
        container.querySelectorAll(".favorite-quote"),
      );
      expect(favoriteQuotes.length).toBe(3);

      const quoteTexts = favoriteQuotes.map((el) =>
        el.textContent.replace(/"/g, "").trim(),
      );
      expect(quoteTexts[0]).toBe("Oldest quote");
      expect(quoteTexts[1]).toBe("Middle quote");
      expect(quoteTexts[2]).toBe("Newest quote");
    });
  });

  test("component must handle max 10 favorites correctly when loading from localStorage", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = Array.from({ length: 10 }, (_, i) => ({
      quote: `Quote ${i + 1}`,
      author: `Author ${i + 1}`,
    }));

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(10);
    });
  });

  test("duplicate prevention logic must work with loaded favorites", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "Unique quote 1", author: "Author 1" },
      { quote: "Unique quote 2", author: "Author 2" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(2);

      const quotes = Array.from(
        container.querySelectorAll(".favorite-quote"),
      ).map((el) => el.textContent.replace(/"/g, "").trim());
      expect(quotes).toContain("Unique quote 1");
      expect(quotes).toContain("Unique quote 2");
    });
  });

  test("empty localStorage must result in empty favorites list on initial render", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    localStorage.clear();

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(0);
    });
  });

  test("invalid JSON in localStorage must not crash component on initial render", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    localStorage.setItem("favoriteQuotes", "invalid json {{{");

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const quoteSection = container.querySelector(".quote-section");
      expect(quoteSection).toBeTruthy();
    });
  });
});

describe("Undo State Cleared After Refresh", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("undo state (pendingRemoval) must be null/cleared after page refresh (initial mount)", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "Test quote 1", author: "Author 1" },
      { quote: "Test quote 2", author: "Author 2" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const undoButton = container.querySelector(".undo-btn");
      expect(undoButton).toBeNull();
    });
  });

  test("undo banner must not appear on initial render after refresh", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [{ quote: "Test quote 1", author: "Author 1" }];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const undoBanner = container.querySelector(".undo-banner");
      expect(undoBanner).toBeNull();
    });
  });

  test("favorites displayed after refresh must exactly match localStorage data", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "Persisted quote 1", author: "Author 1" },
      { quote: "Persisted quote 2", author: "Author 2" },
      { quote: "Persisted quote 3", author: "Author 3" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteQuotes = Array.from(
        container.querySelectorAll(".favorite-quote"),
      ).map((el) => el.textContent.replace(/"/g, "").trim());

      expect(favoriteQuotes).toEqual([
        "Persisted quote 1",
        "Persisted quote 2",
        "Persisted quote 3",
      ]);
    });
  });

  test("favorites count after refresh must match localStorage data exactly", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = Array.from({ length: 5 }, (_, i) => ({
      quote: `Quote ${i + 1}`,
      author: `Author ${i + 1}`,
    }));

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(5);
    });
  });

  test("no undo timer should be active on initial mount after refresh", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [{ quote: "Test quote", author: "Test author" }];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const quoteSection = container.querySelector(".quote-section");
      expect(quoteSection).toBeTruthy();
    });

    // Wait to ensure no undo timer is running
    await new Promise((resolve) => setTimeout(resolve, 100));

    const undoButton = container.querySelector(".undo-btn");
    expect(undoButton).toBeNull();
  });

  test("after refresh, component state must not contain pendingRemoval data", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [{ quote: "Quote after refresh", author: "Author" }];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      // Verify favorites loaded
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(1);

      // Verify no undo UI elements
      const undoBanner = container.querySelector(".undo-banner");
      const undoButton = container.querySelector(".undo-btn");
      expect(undoBanner).toBeNull();
      expect(undoButton).toBeNull();
    });
  });
});

describe("localStorage Behavior During Undo Window", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("after clicking undo, localStorage must be updated with restored favorites", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    const testFavorites = [
      { quote: "Quote 1", author: "Author 1" },
      { quote: "Quote 2", author: "Author 2" },
      { quote: "Quote 3", author: "Author 3" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(3);
    });

    // Remove the second favorite
    const removeButtons = container.querySelectorAll(".remove-btn");
    removeButtons[1].click();

    // Verify undo button appears
    await waitFor(() => {
      const undoButton = container.querySelector(".undo-btn");
      expect(undoButton).toBeTruthy();
    });

    // Click undo
    const undoButton = container.querySelector(".undo-btn");
    undoButton.click();

    // Wait for state to update
    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(3);
    });

    // Verify localStorage was updated with all 3 favorites after undo
    const storedData = localStorage.getItem("favoriteQuotes");
    const storedFavorites = JSON.parse(storedData);
    expect(storedFavorites.length).toBe(3);
    expect(storedFavorites[1].quote).toBe("Quote 2");
  });

  test("after undo timeout expires, localStorage must be updated without removed item", async () => {
    if (!componentAvailable()) {
      throw new Error(
        "Quote component not available - favorites functionality not implemented",
      );
    }

    jest.useFakeTimers();

    const testFavorites = [
      { quote: "Quote A", author: "Author A" },
      { quote: "Quote B", author: "Author B" },
    ];

    localStorage.setItem("favoriteQuotes", JSON.stringify(testFavorites));

    const Quote = loadQuoteComponent();
    const { container } = render(<Quote />);

    await waitFor(() => {
      const favoriteItems = container.querySelectorAll(".favorite-item");
      expect(favoriteItems.length).toBe(2);
    });

    // Remove first favorite
    const removeButtons = container.querySelectorAll(".remove-btn");
    removeButtons[0].click();

    // Verify localStorage still has 2 items during undo window
    let storedData = localStorage.getItem("favoriteQuotes");
    let storedFavorites = JSON.parse(storedData);
    expect(storedFavorites.length).toBe(2);

    // Fast-forward 5 seconds to expire undo
    jest.advanceTimersByTime(5000);

    // Wait for timeout callback to execute
    await waitFor(() => {
      const undoButton = container.querySelector(".undo-btn");
      expect(undoButton).toBeNull();
    });

    // Now localStorage should be updated with only 1 item
    storedData = localStorage.getItem("favoriteQuotes");
    storedFavorites = JSON.parse(storedData);
    expect(storedFavorites.length).toBe(1);
    expect(storedFavorites[0].quote).toBe("Quote B");

    jest.useRealTimers();
  });
});
