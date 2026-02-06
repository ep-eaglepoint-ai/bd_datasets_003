const { getQuoteJsContent, getQuotesJsContent } = require("./utils");

describe("Original Quote Functionality", () => {
  test("must import React", () => {
    const content = getQuoteJsContent();
    expect(content.includes("import React")).toBe(true);
  });

  test("must import quotes data", () => {
    const content = getQuoteJsContent();
    const hasQuotesImport = /import.*quotes|from.*quotes/.test(content);
    expect(hasQuotesImport).toBe(true);
  });

  test("must export Quote component", () => {
    const content = getQuoteJsContent();
    const hasExport =
      content.includes("export default") || content.includes("export class");
    expect(hasExport).toBe(true);
  });

  test("must have randomQuoteIndex in state", () => {
    const content = getQuoteJsContent();
    const hasState = content.includes("randomQuoteIndex");
    expect(hasState).toBe(true);
  });

  test("must have handleChange method for generating random quotes", () => {
    const content = getQuoteJsContent();
    const hasHandler = content.includes("handleChange");
    expect(hasHandler).toBe(true);
  });

  test("must use Math.random for random quotes", () => {
    const content = getQuoteJsContent();
    const hasRandom = content.includes("Math.random");
    expect(hasRandom).toBe(true);
  });

  test("must have Generate Random Quote button", () => {
    const content = getQuoteJsContent();
    const hasButton = /Generate.*Quote|Random.*Quote/i.test(content);
    expect(hasButton).toBe(true);
  });

  test("must render quote text", () => {
    const content = getQuoteJsContent();
    const rendersQuote =
      content.includes(".quote") || content.includes("quote}");
    expect(rendersQuote).toBe(true);
  });

  test("must render author name", () => {
    const content = getQuoteJsContent();
    const rendersAuthor =
      content.includes(".author") || content.includes("author}");
    expect(rendersAuthor).toBe(true);
  });

  test("must have quote-section CSS class", () => {
    const content = getQuoteJsContent();
    const hasClass = content.includes("quote-section");
    expect(hasClass).toBe(true);
  });
});

describe("Quotes Data", () => {
  test("must export quotes function", () => {
    const content = getQuotesJsContent();
    const hasFunction =
      content.includes("export function quotes") ||
      content.includes("function quotes");
    expect(hasFunction).toBe(true);
  });

  test("must return array of quotes", () => {
    const content = getQuotesJsContent();
    const hasArray = content.includes("quotesData") && content.includes("[");
    expect(hasArray).toBe(true);
  });

  test("each quote must have id, quote, and author fields", () => {
    const content = getQuotesJsContent();
    const hasId = content.includes('"id"');
    const hasQuote = content.includes('"quote"');
    const hasAuthor = content.includes('"author"');
    expect(hasId && hasQuote && hasAuthor).toBe(true);
  });

  test("must have at least 10 quotes", () => {
    const content = getQuotesJsContent();
    const quoteCount = (content.match(/"id"/g) || []).length;
    expect(quoteCount).toBeGreaterThanOrEqual(10);
  });
});

describe("Component Structure", () => {
  test("must be a valid React component", () => {
    const content = getQuoteJsContent();
    const isClass = content.includes("extends React.Component");
    const isFunction = /function\s+Quote|const\s+Quote\s*=/.test(content);
    expect(isClass || isFunction).toBe(true);
  });

  test("must have render method or return JSX", () => {
    const content = getQuoteJsContent();
    const hasRender =
      content.includes("render()") || content.includes("render ()");
    const hasReturn =
      content.includes("return") &&
      (content.includes("<div") || content.includes("<>"));
    expect(hasRender || hasReturn).toBe(true);
  });

  test("must return JSX with div elements", () => {
    const content = getQuoteJsContent();
    const hasJsx = content.includes("<div") && content.includes("</div>");
    expect(hasJsx).toBe(true);
  });
});

describe("Code Structure Constraints", () => {
  test("Quote should remain a class component", () => {
    const content = getQuoteJsContent();
    const isClass = content.includes("class Quote extends React.Component");
    expect(isClass).toBe(true);
  });

  test("must not use external state management", () => {
    const content = getQuoteJsContent().toLowerCase();
    const hasRedux = content.includes("redux");
    const hasMobx = content.includes("mobx");
    const hasRecoil = content.includes("recoil");
    expect(hasRedux || hasMobx || hasRecoil).toBe(false);
  });

  test("must not use external timer libraries", () => {
    const content = getQuoteJsContent().toLowerCase();
    const hasLodashDebounce =
      content.includes("lodash") && content.includes("debounce");
    expect(hasLodashDebounce).toBe(false);
  });
});
