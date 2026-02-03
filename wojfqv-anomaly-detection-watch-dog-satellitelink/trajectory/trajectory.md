# Trajectory

## 1. Requirement Analysis
   I started by deconstructing the prompt into core requirements using the **"Refactoring → Code Generation"** framework. The task demanded a stateful, dual-window statistical analyzer for satellite link latency that could detect anomalies without third-party libraries. I identified the critical constraints: maintaining a 200-sample sliding window, manual calculation of population variance and standard deviation, and handling the "zero-variance" edge case where a perfectly flat baseline could cause division errors or strict threshold logic issues. I referenced typical sliding window algorithms to ensure an O(1) complexity design for high-throughput compliance.
   Resources:
   - [Sliding Window Algorithm](https://en.wikipedia.org/wiki/Sliding_window_protocol)
   - [Standard Deviation formulas](https://en.wikipedia.org/wiki/Standard_deviation)

## 2. Domain Modeling
   I designed the `LinkWatchdog` class to encapsulate the state for each satellite "Link ID". I chose a JavaScript `Map` as the primary data structure to store link states because of its O(1) average time complexity for lookups, which is essential for handling thousands of concurrent signals. Each link state object maintains a simple array for the 200-sample buffer and a string status. This minimal scaffolding ensures that the application memory footprint remains low while providing predictable state transitions from 'WARMING_UP' to 'NOMINAL' or 'ANOMALY'.
   Resources:
   - [MDN: Map objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
   - [Memory Management in V8](https://v8.dev/blog/memory-management)

## 3. Core Implementation
   I implemented the `process(linkId, latencyMs)` method as the single entry point for data ingestion. The logic strictly follows the "Baseline" (first 100) vs. "Current" (last 100) window segmentation. I wrote helper functions for statistical math—calculating mean and population standard deviation manually—to satisfy the "no third-party libraries" rule. I paid special attention to the "zero variance" edge case by strictly following the formula `|Mean(curr) - Mean(base)| > 2 * StdDev(base)`, ensuring that if the standard deviation is zero (a flat line), any deviation in the current window correctly triggers an anomaly, as the threshold becomes zero.
   Resources:
   - [Calculate Variance in JS](https://www.geeksforgeeks.org/program-to-find-variance/)
   - [JavaScript Array.prototype.slice()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice)

## 4. Edge Case Verification
   I refined the implementation to ensure robust handling of system initialization and state resets. I added a `reset(linkId)` method to manually purge state, instantly returning a link to the 'WARMING_UP' phase. I also verified the "Warmup Constraint" where the system must return 'WARMING_UP' until exactly 200 samples are recorded. This was critical for avoiding false positives during the initial data accumulation phase.
   Resources:
   - [Testing Edge Cases](https://martinfowler.com/bliki/TestPyramid.html)

## 5. Validation and Evaluation
   Finally, I built a rigorous verification suite using a custom evaluation runner and Jest tests. I created specific test cases to simulate the exact scenarios requested: a stable stream of 10.0ms pulses followed by a sudden spike to 250.0ms to confirm anomaly detection, and a "Flat Baseline Drift" test to verify the zero-variance handling. The evaluation system was designed to produce a strict JSON output format including run IDs and environment metadata, ensuring the solution met all deliverable requirements for the benchmarking task.
   Resources:
   - [Jest Testing Framework](https://jestjs.io/)
   - [Node.js Child Process](https://nodejs.org/api/child_process.html)
