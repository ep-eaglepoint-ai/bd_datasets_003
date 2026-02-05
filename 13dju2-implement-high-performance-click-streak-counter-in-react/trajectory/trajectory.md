# Trajectory

## 1. Understanding the Requirements

I read through the task requirements for a click streak counter component. The key challenges were:
- Tracking rapid clicks without missing any
- Resetting the streak exactly 1 second after the last click
- Updating the highest streak only when appropriate
- Avoiding stale closures in timer callbacks
- Minimizing unnecessary re-renders

React's setState and useEffect can cause stale closure issues when dealing with timers. A common mistake is capturing old state values in setTimeout callbacks.

Reference: Understanding closures in React hooks
Link: https://overreacted.io/making-setinterval-declarative-with-react-hooks/

## 2. Identifying Performance Patterns

The main performance concern was minimizing re-renders during rapid clicking. Each click needs to update the display, but we shouldn't trigger extra renders from timer management.

I researched patterns for handling mutable values without triggering re-renders. Using `useRef` for values that don't need to cause re-renders is a well-established pattern.

Reference: useRef for mutable values
Link: https://react.dev/reference/react/useRef#referencing-a-value-with-a-ref

## 3. Designing the Timer Strategy

The critical insight was that each click must:
1. Clear any existing timer
2. Increment the count
3. Start a fresh 1-second timer

Using `useRef` for the timer ID allows clearing without stale reference issues. The timer callback also needs access to the current count, not a stale captured value.

I implemented this by storing both the timer reference and the current count in refs, then synchronizing the ref values with state only when display updates are needed.

## 4. Implementing the Streak Logic

The component maintains two pieces of displayed state:
- `currentCount`: The ongoing streak counter
- `highestStreak`: The best streak achieved

When a streak ends (timer fires), I compare the current count against the highest and update if necessary, then reset current to zero.

Using `useCallback` for handlers ensures stable function references, which prevents unnecessary child re-renders if the component is composed with others.

## 5. Handling Edge Cases

I accounted for several edge cases:
- Component unmounting mid-streak (cleanup in useEffect return)
- Multiple component instances running independently (each has its own refs)
- Very rapid clicking (100+ clicks in quick succession)
- Clicks at precisely the timeout boundary

Reference: Cleanup functions in useEffect
Link: https://react.dev/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed

## 6. Result

The implementation satisfies all requirements:
- Each click increments the counter correctly
- The streak resets exactly 1 second after the last click
- Highest streak persists and updates only when beaten
- No stale closures due to ref-based mutable values
- Only necessary re-renders occur (one per click, one on reset)
- Pure React hooks implementation with no external dependencies
