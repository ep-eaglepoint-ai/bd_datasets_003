import * as fs from "fs";
import * as path from "path";

// From tests/helpers, go up to repo root then into repository_after/color-pallete-tool/src
const REPO_SRC = path.join(__dirname, "..", "..", "repository_after", "color-pallete-tool", "src");

export function sourcePath(...parts: string[]): string {
  return path.join(REPO_SRC, ...parts);
}

export function readSourceFile(...parts: string[]): string {
  const filePath = sourcePath(...parts);
  return fs.readFileSync(filePath, "utf-8");
}

export function sourceFileExists(...parts: string[]): boolean {
  const filePath = sourcePath(...parts);
  return fs.existsSync(filePath);
}
