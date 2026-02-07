# Implement Reusable Circuit Breaker for Backend Services

A production-grade Circuit Breaker implementation for protecting against cascading failures when calling unreliable external dependencies.

## Quick Start

### Running Tests (Docker)

```bash
docker compose build
docker compose run --rm app npm test
```

### Running Evaluation (Docker)

```bash
docker compose run --rm app
```

### Running Tests (Local)

```bash
npm install
npm test
```

### Building

```bash
npm run build
```

## Project Structure

```
├── repository_after/src/   # Circuit breaker implementation
│   ├── CircuitBreaker.ts   # Main class
│   ├── types.ts            # Types, interfaces, CircuitOpenError
│   └── index.ts            # Public exports
├── tests/                  # Test suites
├── evaluation/             # Evaluation scripts
├── jest.config.js          # Jest configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```
