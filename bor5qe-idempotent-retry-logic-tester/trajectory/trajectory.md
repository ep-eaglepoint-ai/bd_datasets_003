# Trajectory


## The Problem: The FetchWithRetry method don't have Functional and timing test

currently fetchWithRetry utility function retries request on network failures, service unaavailable and 5xx responses and applies exponential backoff between retries.
However, there are currently no automated tests that verify:
- Retry behavior under different HTTP status codes
- Correct handling of non-retriable 4xx client errors
- Correct exponential backoff timing between retry attempts
- requests are not duplicated unnecessarily
- request parameters remain consistent across retries

couldn't know if fetchWithRetry function behaves correctly under various HTTP status codes.

## The Solution: Add Jest tests covering retry logic and timing behavior
1. Mock the network layer -- Mock global.fetch to simulate controlled response sequences
2. useFaketimer -- to control and assert retry delays
3. Add test to verify exponential backoff timing -- assert that retry delays follow the expected exponential sequence
4. Add test to validate non-retriable errors -- assert that 4xx responses throw immediately
5. Add test to verify if first call succeed fetch called exactly once
6. Add test to assert that the `url` and `options` passed to the mock fetch match the original arguments in every retry attempt. Add test to verify 
7. Mutation / negative testing -- run the same test suite against intentionally broken implementations of fetchWithRetry to verify that incorrect behaviors are correctly detected by failing tests

### Recommended Resources
*1. Jest fake timers (jest.useFakeTimers, jest.runAllTimersAsync)
*2. Mocking global.fetch
*3. Jest ESM testing