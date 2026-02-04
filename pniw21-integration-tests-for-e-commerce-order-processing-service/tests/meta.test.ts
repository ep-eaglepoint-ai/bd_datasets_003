import { spawnSync } from "child_process";
import path from "path";

function runJestWithConfig(configPath: string, args: string[] = []) {
  const jestBin = path.resolve(
    __dirname,
    "..",
    "node_modules",
    "jest",
    "bin",
    "jest.js"
  );

  return spawnSync(
    process.execPath,
    [jestBin, "--config", configPath, "--runInBand", ...args],
    {
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      encoding: "utf8",
      timeout: 120_000,
    }
  );
}

test("integration suite fails against a faulty SUT", () => {
  const configPath = path.resolve(__dirname, "jest.faulty.config.ts");

  const result = runJestWithConfig(configPath);

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  expect(result.status).not.toBe(0);
  expect(combinedOutput).toContain("FAIL");
  expect(combinedOutput).toMatch(
    /payment\.refund\.int\.test\.ts|order\.creation\.int\.test\.ts/i
  );
});

test("integration suite passes twice, supports randomization, and completes within 30s", () => {
  const configPath = path.resolve(
    __dirname,
    "..",
    "repository_after",
    "jest.config.ts"
  );

  const start1 = Date.now();
  const first = runJestWithConfig(configPath);
  const duration1 = Date.now() - start1;

  expect(first.status).toBe(0);
  expect(duration1).toBeLessThanOrEqual(30_000);

  const start2 = Date.now();
  const second = runJestWithConfig(configPath, [
    "--randomize",
    "--seed",
    "123",
  ]);
  const duration2 = Date.now() - start2;

  expect(second.status).toBe(0);
  expect(duration2).toBeLessThanOrEqual(30_000);
});

test("concurrent orders test passes 10 consecutive runs", () => {
  const configPath = path.resolve(
    __dirname,
    "..",
    "repository_after",
    "jest.config.ts"
  );
  const testPath = path.resolve(
    __dirname,
    "..",
    "repository_after",
    "order.creation.int.test.ts"
  );

  for (let i = 0; i < 10; i += 1) {
    const run = runJestWithConfig(configPath, [
      "--runTestsByPath",
      testPath,
      "--testNamePattern",
      "concurrent orders for limited inventory",
      "--no-coverage",
    ]);
    expect(run.status).toBe(0);
  }
});
