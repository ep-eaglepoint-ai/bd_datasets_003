# Trajectory: High-Performance React Clock & Testing Architecture

## 1. Problem Analysis & Component Strategy

When building a real-time clock in React, the primary challenge isn't just showing the time—it's managing **side effects** and **rendering performance**. I opted for a Class Component approach to demonstrate a deep understanding of the React lifecycle, specifically how to prevent memory leaks in stateful UI.

- **State Management:** I initialized the state with the current `Date` object and a default `locale` of `en-US`.
- **The Lifecycle Challenge:** I researched the risks of "dangling timers." If `setInterval` isn't cleared when a user navigates away, the component attempts to update the state of an unmounted component, leading to memory leaks. I solved this by binding the interval to a class property and using `componentWillUnmount`.

---

## 2. Localization & Intl Logic

I wanted the app to be truly global, supporting English and Bengali. Instead of using heavy external libraries like Moment.js, I researched the native **Intl.DateTimeFormat** API.

- **Logic:** By using `time.toLocaleTimeString(this.state.locale)`, the component dynamically adjusts its numbering system (e.g., Western vs. Bengali numerals) and time period markers (AM/PM).
- **Toggle Strategy:** I implemented a single-source-of-truth toggle function that switches the locale string, triggering a re-render of the time format instantly.

---

## 3. Optimization via PureComponents & Reconciliation

A common pitfall in React is "unnecessary re-renders." In this clock, the time updates every second. I didn't want the "Change Language" button to re-calculate or re-render every single second just because its parent state changed.

- **Strategy:** I researched [React.PureComponent vs Component](https://stackoverflow.com/questions/41340697/react-component-vs-react-purecomponent). By moving the Button into its own class extending `PureComponent`, I ensured it only re-renders when its specific `props` (the click handler or locale) change, not when the clock ticks.
- **Verification:** I planned to use **Jest Spies** to track render calls, ensuring the UI remains performant even with high-frequency updates.

---

## 4. Testing Strategy: Fake Timers & Spies

To meet the strict requirements, I researched advanced testing patterns in **Jest** and **React Testing Library (RTL)**. Testing time is notoriously flaky, so I moved away from "real" time.

- **Jest Fake Timers:** I used `jest.useFakeTimers()` to control the flow of time. I researched how to use `jest.advanceTimersByTime(1000)` to simulate the passage of seconds without actually waiting, allowing for lightning-fast test execution.
- **Lifecycle Spies:** I implemented `jest.spyOn(global, 'setInterval')` and `clearInterval` to verify that the component is a "good citizen" of the DOM, cleaning up after itself.
- **Locale Validation:** I researched the specific character sets for Bengali (e.g., "১২:০০" vs "12:00") to ensure the `bn-BD` locale was rendering the correct glyphs.

---

## 5. Key Learning Resources

I strictly validated my implementation logic using these high-authority resources:

- **Official Docs:** [React Lifecycle Methods Diagram](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRn65SiZR4B1moSWq88Stk1sbHBj85S2M0VTw&s) — Essential for placing the interval in `componentDidMount`.
- **Technical Tutorial:** [Testing Intervals and Timeouts in Jest](https://jestjs.io/docs/timer-mocks) — I researched this to master the `act()` wrapper around fake timers to avoid "not wrapped in act" warnings in RTL.
- **Localization Guide:** [MDN Web Docs: Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) — Used to confirm the standard locale strings for Bengali (`bn-BD`).
- **Performance Insight:** [Medium: React Functional vs Class Render Performance](https://medium.com/@fibonalabsdigital/react-class-components-vs-functional-components-which-is-better-776d0e2b4ed2) — I googled this to justify the use of `PureComponent` for the button optimization.
