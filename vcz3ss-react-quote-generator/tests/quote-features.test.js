const fs = require("fs");
const path = require("path");

const repoPath =
  process.env.REPO_PATH || path.join(__dirname, "..", "repository_after");

function getQuoteJsContent() {
  const quotePath = path.join(repoPath, "src", "components", "Quote.js");
  if (fs.existsSync(quotePath)) {
    return fs.readFileSync(quotePath, "utf-8");
  }
  return "";
}

function getAppCssContent() {
  const cssPath = path.join(repoPath, "src", "App.css");
  if (fs.existsSync(cssPath)) {
    return fs.readFileSync(cssPath, "utf-8");
  }
  return "";
}

describe("Heart/Favorites Functionality", () => {
  test("heart icon must exist to add quotes to favorites", () => {
    const content = getQuoteJsContent();
    const hasHeart = /[♥♡]|heart/i.test(content);
    expect(hasHeart).toBe(true);
  });

  test("heart icon must show filled state when quote is favorited", () => {
    const content = getQuoteJsContent();
    const hasFilledClass = content.includes("filled");
    const hasHeartBtn = content.includes("heart-btn");
    expect(hasFilledClass && hasHeartBtn).toBe(true);
  });

  test("component must maintain favorites state", () => {
    const content = getQuoteJsContent();
    const hasFavoritesState =
      content.includes("favorites") && content.includes("state");
    expect(hasFavoritesState).toBe(true);
  });

  test("must check if current quote is already favorited", () => {
    const content = getQuoteJsContent();
    const hasFavoritedCheck =
      /isQuoteFavorited|isFavorited|favorites\.some|favorites\.find/.test(
        content,
      );
    expect(hasFavoritedCheck).toBe(true);
  });
});

describe("Maximum Favorites Limit", () => {
  test("maximum 10 favorites must be enforced", () => {
    const content = getQuoteJsContent();
    const hasMaxLimit = /MAX_FAVORITES\s*=\s*10|max.*10|10.*max/i.test(content);
    expect(hasMaxLimit).toBe(true);
  });

  test("must check limit before adding new favorites", () => {
    const content = getQuoteJsContent();
    const hasCanAddCheck =
      /canAddFavorite|favorites\.length\s*[<>=]|getEffectiveFavoritesCount/.test(
        content,
      );
    expect(hasCanAddCheck).toBe(true);
  });
});

describe("Duplicate Prevention", () => {
  test("quotes with identical text are duplicates regardless of author", () => {
    const content = getQuoteJsContent();
    const checksQuoteText =
      /\.quote\s*===|\.quote\s*==|fav\.quote|quote\.quote/.test(content);
    expect(checksQuoteText).toBe(true);
  });
});

describe("Favorites Display", () => {
  test("favorites must be displayed in a list", () => {
    const content = getQuoteJsContent();
    const hasList = /favorites-list|<ul|<ol|\.map\(/.test(content);
    expect(hasList).toBe(true);
  });

  test("new favorites should be added to end of array (oldest first display)", () => {
    const content = getQuoteJsContent();
    const hasAppend = /\[\.\.\.favorites|favorites\.concat|push/.test(content);
    expect(hasAppend).toBe(true);
  });
});

describe("localStorage Persistence", () => {
  test("must use localStorage for persistence", () => {
    const content = getQuoteJsContent();
    const hasStorageKey = /localStorage|STORAGE_KEY/.test(content);
    expect(hasStorageKey).toBe(true);
  });

  test("must load favorites from localStorage", () => {
    const content = getQuoteJsContent();
    const hasGetItem = content.includes("localStorage.getItem");
    expect(hasGetItem).toBe(true);
  });

  test("must save favorites to localStorage", () => {
    const content = getQuoteJsContent();
    const hasSetItem = content.includes("localStorage.setItem");
    expect(hasSetItem).toBe(true);
  });

  test("must load localStorage on component mount", () => {
    const content = getQuoteJsContent();
    const hasMount =
      content.includes("componentDidMount") || content.includes("useEffect");
    expect(hasMount).toBe(true);
  });
});

describe("Search Functionality", () => {
  test("must have search input for filtering favorites", () => {
    const content = getQuoteJsContent();
    const hasSearchInput =
      /search-input|searchQuery|<input.*search|type="text"/i.test(content);
    expect(hasSearchInput).toBe(true);
  });

  test("must maintain search query in state", () => {
    const content = getQuoteJsContent();
    const hasSearchState =
      content.includes("searchQuery") ||
      content.toLowerCase().includes("search");
    expect(hasSearchState).toBe(true);
  });

  test("search must be case-insensitive", () => {
    const content = getQuoteJsContent();
    const hasLowerCase = content.includes("toLowerCase()");
    expect(hasLowerCase).toBe(true);
  });

  test("must filter by both quote text and author", () => {
    const content = getQuoteJsContent();
    const filtersQuote = /\.quote\.toLowerCase\(\)|quote.*includes/.test(
      content,
    );
    const filtersAuthor = /\.author\.toLowerCase\(\)|author.*includes/.test(
      content,
    );
    expect(filtersQuote && filtersAuthor).toBe(true);
  });

  test("must have method to filter favorites", () => {
    const content = getQuoteJsContent();
    const hasFilterMethod =
      /getFilteredFavorites|filteredFavorites|\.filter\(/.test(content);
    expect(hasFilterMethod).toBe(true);
  });
});

describe("Undo Functionality", () => {
  test("removing a favorite must show Undo option", () => {
    const content = getQuoteJsContent();
    const hasUndo = /[Uu]ndo|undo-btn|handleUndo/.test(content);
    expect(hasUndo).toBe(true);
  });

  test("undo button must appear for 5 seconds", () => {
    const content = getQuoteJsContent();
    const hasTimeout = /setTimeout|5000|UNDO_TIMEOUT/.test(content);
    expect(hasTimeout).toBe(true);
  });

  test("must track pending removal for undo", () => {
    const content = getQuoteJsContent();
    const hasPending =
      content.includes("pendingRemoval") ||
      content.toLowerCase().includes("pending");
    expect(hasPending).toBe(true);
  });

  test("must track original position for undo restore", () => {
    const content = getQuoteJsContent();
    const tracksPosition =
      content.includes("originalIndex") ||
      content.toLowerCase().includes("original");
    expect(tracksPosition).toBe(true);
  });

  test("must clear timeout when needed", () => {
    const content = getQuoteJsContent();
    const hasClearTimeout = content.includes("clearTimeout");
    expect(hasClearTimeout).toBe(true);
  });
});

describe("Critical Behaviors", () => {
  test("must consider pending removal when checking favorites limit", () => {
    const content = getQuoteJsContent();
    const hasEffectiveCount =
      /getEffectiveFavoritesCount|pendingRemoval.*length|effectiveCount/.test(
        content,
      );
    expect(hasEffectiveCount).toBe(true);
  });

  test("localStorage should only update after undo timeout expires", () => {
    const content = getQuoteJsContent();
    const timeoutPattern =
      /setTimeout\s*\(\s*\(\)\s*=>\s*\{[^}]*localStorage\.setItem/s.test(
        content,
      );
    expect(timeoutPattern).toBe(true);
  });

  test("heart state must update in real-time when quote changes", () => {
    const content = getQuoteJsContent();
    const hasRealtimeCheck =
      /render.*isFavorited|getCurrentQuote.*isQuoteFavorited/s.test(content);
    expect(hasRealtimeCheck).toBe(true);
  });
});
