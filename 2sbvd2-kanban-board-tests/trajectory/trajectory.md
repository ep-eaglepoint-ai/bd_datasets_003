# Trajectory: How I Built the Kanban Meta Test

The goal was to make sure the Kanban test suite works correctly.  
This means the tests must:

- Fail when the code is broken
- Pass when the code is correct

## Step 1: Using an Isolated Test Environment

I created a **temporary test project** every time tests run.  
This project contains the implementation, tests, and configs.
This ensures:

- Clean test runs
- No caching problems
- No interference between runs
  This follows the idea of test isolation.
  Reference:  
  https://martinfowler.com/articles/nonDeterminism.html

---

## Step 2: Reusing Dependencies for Speed

Installing dependencies every time is slow.  
So I reused `node_modules` using a symlink from a base project.
This made test execution much faster.
Reference:  
https://nodejs.org/api/fs.html#fssymlinksynctarget-path-type

---

## Step 3: Testing Broken Implementations

I created **broken versions** of the Kanban page, such as:

- Wrong column titles
- Wrong card counts
- Missing elements
- Wrong test IDs
  Each broken version must make the tests fail.  
  This ensures the test suite detects real problems.

---

## Step 4: Testing the Correct Implementation

I also tested the **correct implementation**.
The tests must pass in this case.  
This verifies both error detection and correct behavior validation.

---

## Step 5: Running Jest Automatically

I ran Jest using Node.js `child_process` to:

- Run tests automatically
- Capture pass/fail results
- Capture output
  Reference:  
  https://nodejs.org/api/child_process.html

---

## Step 6: Configuring Jest Properly

I configured Jest for Next.js and React using:

- jsdom environment
- babel-jest
- next/babel preset
  Reference:  
  https://nextjs.org/docs/testing  
  https://jestjs.io/docs/configuration

---

## Step 7: Creating an Evaluation System

I created a script that runs tests on:

- repository_before
- repository_after
  It records pass/fail results, execution time, and generates a JSON report.  
  This allows automatic validation of the test suite.
