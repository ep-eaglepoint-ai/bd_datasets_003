import * as fs from "fs";
import * as path from "path";

// REPO_PATH set by Docker (repository_before | repository_after); default repository_after
const repoDir = process.env.REPO_PATH || "repository_after";
// From tests/helpers, go up to repo root then into <repoDir>/color-pallete-tool/src
const REPO_SRC = path.join(__dirname, "..", "..", repoDir, "color-pallete-tool", "src");

export function sourcePath(...parts: string[]): string {
  return path.join(REPO_SRC, ...parts);
}

export function readSourceFile(...parts: string[]): string {
  const filePath = sourcePath(...parts);
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

export function sourceFileExists(...parts: string[]): boolean {
  const filePath = sourcePath(...parts);
  return fs.existsSync(filePath);
}
