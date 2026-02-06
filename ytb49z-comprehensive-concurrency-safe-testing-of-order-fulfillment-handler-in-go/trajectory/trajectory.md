# Trajectory

1. **Analyze the requirement** — define correctness and concurrency goals. Reference: https://go.dev/doc/testing
2. **Baseline implementation** — add sequential tests for core flow. Reference: https://pkg.go.dev/testing
3. **Concurrency testing** — run goroutines and check for race conditions. Reference: https://go.dev/doc/articles/race_detector
4. **Thread-safety** — protect shared state with mutexes. Reference: https://pkg.go.dev/sync#Mutex
5. **Comprehensive suite** — add oversell, stock, and edge-case tests. Reference: https://go.dev/blog/subtests
6. **Final checks** — run verbose tests with race detector. Reference: https://go.dev/doc/testing
