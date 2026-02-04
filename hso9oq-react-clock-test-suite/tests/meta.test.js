const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

describe("Meta Tests", () => {
  const testFilePath = "/app/src/components/Clock.test.js";
  const repoBeforePath = "/app/repository_before_mount/src/components/Clock.test.js";
  const clockComponentPath = "/app/src/components/Clock.js";
  const backupClockPath = "/app/src/components/Clock.js.bak";

  afterAll(() => {
    // Ensure cleanup happens even if tests crash
    if (fs.existsSync(backupClockPath)) {
      fs.copyFileSync(backupClockPath, clockComponentPath);
      fs.unlinkSync(backupClockPath);
    }
  });

  test("Clock.test.js exists in repository_after", () => {
    expect(fs.existsSync(testFilePath)).toBe(true);
  });

  test("Clock.test.js does NOT exist in repository_before", () => {
    expect(fs.existsSync(repoBeforePath)).toBe(false);
  });

  test("Clock.test.js passes on valid implementation", () => {
    if (fs.existsSync(testFilePath)) {
      try {
        execSync("npm test -- src/components/Clock.test.js --watchAll=false", {
          stdio: "pipe",
          cwd: "/app",
        });
        expect(true).toBe(true);
      } catch (error) {
        throw new Error(`User tests failed on valid code:\n${error.stdout}`);
      }
    }
  });

  test("Clock.test.js fails on broken implementation (Mutation Test)", () => {
    if (!fs.existsSync(clockComponentPath)) return;

    // 1. Backup original Clock.js
    fs.copyFileSync(clockComponentPath, backupClockPath);

    try {
      // 2. Read original content
      let clockContent = fs.readFileSync(clockComponentPath, "utf8");

      // 3. Inject a bug: Break Requirement 3 (Title) and Requirement 4 (Button)
      // Check if we can just return empty div
      const brokenContent = `
import React from 'react';
class Clock extends React.Component {
    render() {
        return <div>Broken Clock</div>;
    }
}
export default Clock;
        `;
      fs.writeFileSync(clockComponentPath, brokenContent);

      // 4. Run tests - EXPECT FAILURE
      try {
        execSync("npm test -- src/components/Clock.test.js --watchAll=false", {
          stdio: "pipe",
          cwd: "/app",
        });
        // If we get here, tests PASSED on broken code -> Meta Fail
        throw new Error("Tests passed despite broken implementation! The tests are not verifying the UI correctly.");
      } catch (error) {
        // Expected failure
        // Check if error message contains anticipated failures if possible, but exit code 1 is enough for now
        if (error.message.includes("Tests passed despite broken implementation")) {
          throw error;
        }
        expect(true).toBe(true);
      }
    } finally {
      // 5. Restore original Clock.js
      if (fs.existsSync(backupClockPath)) {
        fs.copyFileSync(backupClockPath, clockComponentPath);
        fs.unlinkSync(backupClockPath);
      }
    }
  });

  // The "Mutation Test" above serves the purpose of verifying the tests catch bugs.
});
