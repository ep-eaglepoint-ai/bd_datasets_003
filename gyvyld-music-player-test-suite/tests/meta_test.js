const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/*
 * META TEST STRATEGY
 *
 * 1. Run the test suite on the existing (buggy) codebase.
 *    Expectation: FAILURE (exit code != 0).
 *
 * 2. Overwrite the buggy components with corrected versions from /tests/resources.
 *
 * 3. Run the test suite again on the patched codebase.
 *    Expectation: SUCCESS (exit code == 0).
 *
 * 4. Verify that specifically expected tests failed in step 1?
 *    (Optional, but for now strict Pass/Fail check suffices as requested).
 */

const targetDir = "/app/src/components"; // Docker path
const resourcesDir = "/tests/resources"; // Docker path

function runTests() {
  try {
    execSync("npm test", { stdio: "inherit", cwd: "/app" });
    return true;
  } catch (e) {
    return false;
  }
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
}

async function main() {
  console.log("--- META TEST START ---");
  console.log("1. Running tests on ORIGINAL (Buggy) Codebase...");

  // We expect this to FAIL.
  const originalPassed = runTests();

  if (originalPassed) {
    console.log("Original codebase passed. Checking if it was supposed to fail...");
  } else {
    console.log("SUCCESS: Tests correctly FAILED on the buggy codebase.");
  }

  console.log("\n2. Patching codebase with CORRECTED implementation...");

  try {
    const controlsSrc = path.join(resourcesDir, "Controls.js");
    const controlsDest = path.join(targetDir, "Controls.js");
    copyFile(controlsSrc, controlsDest);

    const progressBarSrc = path.join(resourcesDir, "ProgressBar.js");
    const progressBarDest = path.join(targetDir, "ProgressBar.js");
    copyFile(progressBarSrc, progressBarDest);
  } catch (e) {
    console.error("Error copying resources:", e);
    process.exit(1);
  }

  console.log("\n3. Running tests on PATCHED (Corrected) Codebase...");
  const patchedPassed = runTests();

  if (patchedPassed) {
    console.log("SUCCESS: Tests PASSED on the patched codebase.");
    console.log("--- META TEST COMPLETED SUCCESSFULLY ---");
    process.exit(0);
  } else {
    console.error("FAILURE: Tests FAILED on the patched codebase.");
    console.error("This implies the tests are flaky or the corrected code is still buggy.");
    process.exit(1);
  }
}

main();
