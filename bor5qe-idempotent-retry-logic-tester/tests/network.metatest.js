
import path from "path";
import { runCLI } from "jest";
import fs from "fs";

const IMPL_DIR = path.resolve("tests/resources");


const TARGET_IMPL_PATH = path.resolve("repository_before/network.js");
let TEST_SUITE_PATH = process.env.TEST_PATH 
TEST_SUITE_PATH = path.join(TEST_SUITE_PATH, "network.test.js");

if (!fs.existsSync(TEST_SUITE_PATH)) {
  throw new Error(`Test suite not found at path: ${TEST_SUITE_PATH}`);
}

async function runNetworkTestSuite(pathToImpl) {
  process.env.IMPL_PATH = pathToImpl;
  const { results } = await runCLI(
    {
      silent: true,
      testPathPatterns: [TEST_SUITE_PATH],
      runInBand: true,
      reporters: [],
    },
    [process.cwd()]
  );
  return results;  
}

function assertMinFailed(name, results, minimum = 1) {
  if (!results) throw new Error(`No results found for ${name}`);
  
  if (results.numRuntimeErrorTestSuites > 0) {
    console.error(results.testResults[0]?.failureMessage);
    throw new Error(`Test Suite Crashed during ${name}. Check the error above.`);
  }
  
  const failed = results.numFailedTests || 0;  
  if (failed < minimum) {
    throw new Error(`Assertion Failed: Expected at least ${minimum} failed tests, but got ${failed}.`);
  }
  console.log(name,": Assertion Passed ✅");
}

export async function testBrokenNoThrow() {
  const results = await runNetworkTestSuite(path.join(IMPL_DIR, "broken_no_throw.js"));
  assertMinFailed("testBrokenNoThrow", results);
}

export async function testBrokenNoRetry() {
  const results = await runNetworkTestSuite(path.join(IMPL_DIR, "broken_no_retry.js"));
  assertMinFailed("testBrokenNoRetry", results);
}

export async function testBrokenRetryOn4xx() {
  const results = await runNetworkTestSuite(path.join(IMPL_DIR, "broken_retry_on_4xx.js"));
  assertMinFailed("testBrokenRetryOn4xx", results);
}

export async function testBrokenParams() {
  const results = await runNetworkTestSuite(path.join(IMPL_DIR, "broken_params.js"));
  assertMinFailed("testBrokenParams", results);
}

export async function testCorrect() {
  const results = await runNetworkTestSuite(TARGET_IMPL_PATH);
  assertMinFailed("testCorrect", results, 0); 

}

// Main metatest runner
async function main() {
  await testBrokenNoThrow();
  await testBrokenNoRetry();
  await testBrokenRetryOn4xx();
  await testBrokenParams();
  await testCorrect();

  console.log("Metatest finished ✅");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
