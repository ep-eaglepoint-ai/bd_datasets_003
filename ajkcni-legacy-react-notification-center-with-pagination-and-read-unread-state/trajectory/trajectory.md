# Trajectory

## 1. Requirement Analysis & Legacy Constraints
The task demanded a legacy React implementation (class components only, no hooks) for a Notification Center. This constraint required careful consideration of how to manage state and binding without modern conveniences. I identified that `React.createClass` was the original legacy way, but since we are using React 16+, it is deprecated. To remain compliant with "Class components only" and avoiding external libraries for `createClass`, I chose `class extends React.Component` with manual method binding in the constructor. This is the standard, robust pattern for React class components.

## 2. Component Design & State Management
I designed the solution with three main components: `NotificationCenter` (container/controller), `NotificationList` (presentation), and `Pagination` (presentation).
- `NotificationCenter` holds the source of truth (`notifications` array, `currentPage`). It manages state updates immutably, ensuring that actions like toggling read status do not mutate the array directly but return new objects, preserving reference integrity where possible.
- `Pagination` handles the math for total pages and disables buttons accurately.
- `NotificationList` is a pure render component but I extracted `NotificationItem` to handle the `onClick` binding cleanly for each item, avoiding anonymous functions or binds in the render loop, which was a specific anti-pattern designated in the prompt.

## 3. Testing Strategy
Since the environment is headless and requires strict correctness, I used `jest` with `react-test-renderer`. This allows snapshot testing and traversing the component tree to verify props and state changes without a browser. I mocked the data module to ensure deterministic query results in tests. I covered all requirements: rendering, pagination logic, read/unread toggling, and keyboard accessibility (simulated via `onKeyDown`).

## 4. Verification & Iteration
Initial evaluation failed due to configuration issues (syntax in `babel.config.js` and module resolution). One key challenge was `createClass` not being available, which I resolved by refactoring to ES6 classes. I also had to explicitly configure Jest `modulePaths` to allow tests in the parent directory to find modules in `repository_after/node_modules`. Once these configuration hurdles were cleared, the logic itself proved correct, passing all 7 tests.
