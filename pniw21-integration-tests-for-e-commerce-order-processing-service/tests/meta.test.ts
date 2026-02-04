import { spawnSync } from "child_process";
import path from "path";

function runJestWithConfig(configPath: string) {
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
    [jestBin, "--config", configPath, "--runInBand"],
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
