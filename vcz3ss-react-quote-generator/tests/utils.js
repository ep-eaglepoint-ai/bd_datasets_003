const fs = require("fs");
const path = require("path");

function getRepoPath() {
  return process.env.REPO_PATH || path.join(__dirname, "..", "repository_after");
}

function getQuoteJsContent() {
  const repoPath = getRepoPath();
  const quotePath = path.join(repoPath, "src", "components", "Quote.js");
  if (fs.existsSync(quotePath)) {
    return fs.readFileSync(quotePath, "utf-8");
  }
  return "";
}

function getQuotesJsContent() {
  const repoPath = getRepoPath();
  const quotesPath = path.join(repoPath, "src", "data", "quotes.js");
  if (fs.existsSync(quotesPath)) {
    return fs.readFileSync(quotesPath, "utf-8");
  }
  return "";
}

function getAppCssContent() {
  const repoPath = getRepoPath();
  const cssPath = path.join(repoPath, "src", "App.css");
  if (fs.existsSync(cssPath)) {
    return fs.readFileSync(cssPath, "utf-8");
  }
  return "";
}

function loadQuoteComponent() {
  try {
    const repoPath = getRepoPath();
    const componentPath = path.join(repoPath, "src", "components", "Quote.js");
    if (fs.existsSync(componentPath)) {
      // Clear require cache to ensure fresh import
      delete require.cache[require.resolve(componentPath)];
      return require(componentPath).default;
    }
  } catch (error) {
    console.error("Failed to load Quote component:", error);
  }
  return null;
}

function componentAvailable() {
  try {
    const repoPath = getRepoPath();
    const componentPath = path.join(repoPath, "src", "components", "Quote.js");
    return fs.existsSync(componentPath);
  } catch {
    return false;
  }
}

module.exports = {
  getRepoPath,
  getQuoteJsContent,
  getQuotesJsContent,
  getAppCssContent,
  loadQuoteComponent,
  componentAvailable
};
