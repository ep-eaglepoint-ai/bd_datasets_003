const fs = require('fs');
const path = require('path');

const hookPath = path.join(__dirname, '../../repository_after/frontend/src/hooks/useSeatBooking.ts');
const src = fs.readFileSync(hookPath, 'utf8');

const tests = [];

function add(name, fn) { tests.push({name, fn}); }
function expect(cond, msg) { if (!cond) throw new Error(msg); }

add('TestMustNotUseExternalLibraries', () => {
  const forbiddenImportPattern = /(from\s+['"](?:axios|socket\.io-client|@tanstack\/react-query|react-query)['"])|(require\(['"](?:axios|socket\.io-client|@tanstack\/react-query|react-query)['"]\))/;
  expect(!forbiddenImportPattern.test(src), 'forbidden frontend library import found');
});

add('TestMustUseUseRefOrUseStateToTrackPreviousStateForRollbackPurposes', () => {
  expect(/useRef<\s*number\s*>\(0\)/.test(src), 'previous state useRef missing');
  expect(/previousSeatCountRef\.current\s*=\s*seatState\.availableSeats/.test(src), 'previous state tracking assignment missing');
});

add('TestStateDecrementMustHappenBeforeFetchPromiseResolvesOptimistic', () => {
  const setIdx = src.indexOf('setSeatState(prev => ({');
  const fetchIdx = src.indexOf('const response = await fetch');
  expect(setIdx !== -1 && fetchIdx !== -1 && setIdx < fetchIdx, 'optimistic decrement does not occur before fetch');
  expect(/availableSeats:\s*Math\.max\(0,\s*prev\.availableSeats\s*-\s*1\)/.test(src), 'optimistic decrement expression missing');
});

add('TestIfFetchFailsCatchBlockOrNon200StatusStateMustRevertToPreviousValue', () => {
  expect(/if\s*\(!response\.ok\)/.test(src), 'non-200 branch missing');
  expect(/availableSeats:\s*currentSeatCount/.test(src), 'rollback to currentSeatCount missing');
  expect(/catch\s*\(networkError\)/.test(src), 'network error catch missing');
});

add('TestMustUseUseEffectToManageEventSourceConnectionAndCloseItOnUnmount', () => {
  expect(/useEffect\(\(\)\s*=>\s*\{[\s\S]*new EventSource\(/.test(src), 'EventSource useEffect setup missing');
  expect(/return\s*\(\)\s*=>\s*\{[\s\S]*eventSource\.close\(\)/.test(src), 'EventSource cleanup missing');
});

add('TestRollbackTestFrontendMockFetchToReturn500ErrorCallBookSeatVerifyStateDecrementsImmediatelyVisualFeedbackWaitsForDelayThenRevertsToOriginalValueAutomatically', () => {
  expect(/catch\s*\(networkError\)[\s\S]*availableSeats:\s*currentSeatCount/.test(src), '500/network rollback behavior missing');
});

add('TestResyncTestFullStackConnectClientAAndClientBClientABooksSeatVerifyClientBReceivesSSEUpdateAndUpdatesDisplayedCountWithoutAnyInteraction', () => {
  expect(/eventSource\.onmessage\s*=\s*\(event\)/.test(src), 'SSE onmessage handler missing');
  expect(/availableSeats:\s*newSeatCount/.test(src), 'SSE server-authoritative state update missing');
});

add('TestSuccessfulBookingFlow', () => {
  expect(/await response\.json\(\)/.test(src), 'success response parsing missing');
  expect(/isLoading:\s*false/.test(src), 'loading clear missing');
});

add('TestConnectionStatusManagement', () => {
  expect(/setConnectionStatus\('reconnecting'\)/.test(src), 'reconnecting status missing');
  expect(/setConnectionStatus\('connected'\)/.test(src), 'connected status missing');
  expect(/setConnectionStatus\('disconnected'\)/.test(src), 'disconnected status missing');
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`✓ ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${t.name}`);
    console.log(`  ${err.message}`);
  }
}

if (failed > 0) process.exit(1);
