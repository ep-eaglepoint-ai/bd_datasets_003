# Polling Application - Implementation Trajectory

## Overview

This project implements a **full-stack polling application** with React frontend and Node.js/Express backend, complete with comprehensive testing (59 tests), evaluation framework, and Docker containerization.

## What Was Built

### 1. Full-Stack Polling Application (`repository_after/`)

#### **Frontend (React)**
- **Create Poll Component**: Form to create polls with 2-5 options
- **Poll Component**: Vote on polls and view real-time results
- **Features**:
  - Dynamic option management (add/remove options)
  - One vote per poll using localStorage only (frontend tracking)
  - Real-time results with progress bars
  - Winner highlighting (including ties)
  - Shareable poll links with copy-to-clipboard
  - Responsive UI with custom CSS

#### **Backend (Express/Node.js)**
- **API Endpoints**:
  - `POST /api/polls` - Create new poll
  - `GET /api/polls/:id` - Get poll details
  - `POST /api/polls/:id/vote` - Submit vote (with voter tracking)
  - `GET /api/polls/:id/results` - Get results
  
- **Features**:
  - In-memory poll storage (no voter tracking)
  - Short readable poll IDs (6 characters, e.g., "ABC123")
  - Comprehensive validation (question, options, vote index)
  - Backend percentage calculation (always sums to 100%)
  - Proper error handling with HTTP status codes
  - Edge case handling (NaN, floats, null values)

#### **Key Rules Implemented**:
- ✅ Poll must have 2-5 options
- ✅ Question and options cannot be empty (backend validation)
- ✅ One vote per poll per user (localStorage only, no IP tracking)
- ✅ Percentages calculated on backend using largest remainder method
- ✅ Zero votes show 0% (not NaN)
- ✅ Options display in creation order (not sorted by votes)
- ✅ Winner highlighting with tie support
- ✅ All validation happens on backend (frontend doesn't bypass)

### 2. Comprehensive Testing (`tests/`)

#### **API Tests** (`tests/api.test.js`) - 18 tests
- Poll creation validation (empty question, wrong number of options, empty options)
- Vote submission and validation
- Edge case validation (NaN, floats, null, negative numbers)
- Backend accepts multiple votes (localStorage prevents duplicate voting on frontend)
- Percentage calculation accuracy
- Error handling (404, 400 status codes)
- Multiple votes on same poll

#### **Frontend Logic Tests** (`tests/frontend.test.js`) - 10 tests
- localStorage voting restrictions
- Poll ID format validation
- Winner calculation logic
- Tie detection
- Option ordering preservation

#### **React Component Tests** (`tests/Poll.test.js`) - 27 tests
- Voting UI rendering and interactions
- Radio button selection (exactly one option)
- Submit button enable/disable logic
- Voting restrictions (localStorage only)
- Results display with vote counts and percentages
- Winner highlighting (single and tied winners)
- Zero votes handling
- Options displayed in creation order
- Persistence after refresh scenarios
- Share link functionality
- Error handling for backend responses

#### **React Component Tests** (`tests/CreatePoll.test.js`) - 13 tests
- Form rendering with 2-5 options
- Backend validation (empty options sent to backend)
- Backend error display
- Form submission and loading states
- Network error handling

**Test Framework**: Jest + Supertest + React Testing Library
**Coverage**: 91.66% statements, 84.53% branches, 94.59% functions, 92.06% lines
**Total Tests**: 59 (all passing)

### 3. Evaluation Framework

#### **Evaluation Script** (`evaluation/evaluation.js`)
- Test result parsing from Jest output
- Structured JSON report generation
- Environment metadata collection
- UTC timestamp-based report organization

### 4. Docker Containerization

#### **Three Docker Services**:

1. **Evaluation Service** (`docker-compose up evaluation`)
   - Installs dependencies
   - Runs evaluation.js
   - Generates JSON report
   - Persists report via volume mount

2. **Test Service** (`docker-compose up test`)
   - Installs dependencies
   - Runs Jest tests directly
   - Shows console output with coverage
   - No JSON report (faster)

3. **Production Services** (`docker-compose up client server`)
   - **Client**: Node.js build with serve package (port 3000)
   - **Server**: Lightweight Node.js Alpine image (port 3001)
   - **Network**: Bridge network for inter-service communication

#### **Docker Architecture**:
- ✅ Separate package.json files for optimal image sizes
- ✅ Better layer caching
- ✅ Independent service scaling
- ✅ Production-ready with serve package
- ✅ One-command deployment

### 5. Project Structure

```
.
├── repository_after/           # Application implementation
│   ├── client/                # React frontend
│   │   ├── src/
│   │   │   ├── components/   # CreatePoll, Poll components
│   │   │   ├── App.js        # Main app with routing
│   │   │   ├── index.js      # Entry point
│   │   │   └── setupTests.js # React Testing Library setup
│   │   ├── public/           # Static assets
│   │   ├── Dockerfile        # Client container
│   │   ├── .dockerignore     # Docker exclusions
│   │   └── package.json      # Client dependencies
│   │
│   ├── server/               # Express backend
│   │   ├── controllers/      # Business logic (pollController.js)
│   │   ├── routes/           # API routes (polls.js)
│   │   ├── utils/            # Helper functions (pollUtils.js)
│   │   ├── index.js          # Server entry point
│   │   ├── Dockerfile        # Server container
│   │   ├── .dockerignore     # Docker exclusions
│   │   └── package.json      # Server dependencies
│   │
│   ├── docker-compose.yml    # Production deployment (not used)
│   └── jest.config.js        # Jest configuration
│
├── repository_before/         # Empty (starting point)
│   └── .gitkeep
│
├── tests/                     # All test files (workspace level)
│   ├── api.test.js           # Backend API tests (18)
│   ├── frontend.test.js      # Frontend logic tests (10)
│   ├── Poll.test.js          # Poll component tests (27)
│   └── CreatePoll.test.js    # CreatePoll component tests (13)
│
├── evaluation/               # Evaluation framework
│   ├── evaluation.js         # Evaluation script
│   └── YYYY-MM-DD/          # Generated reports (gitignored)
│       └── HH-MM-SS/
│           └── report.json
│
├── instances/                # Instance configuration
│   └── instance.json
│
├── patches/                  # Patch files
│   └── diff.patch
│
├── trajectory/               # Implementation documentation
│   └── trajectory.md
│
├── coverage/                 # Test coverage reports (gitignored)
│
├── Dockerfile                # Evaluation/test container
├── docker-compose.yml        # All services (evaluation, test, prod)
├── package.json              # Workspace dependencies
├── jest.config.js            # Multi-project Jest configuration
├── jest.setup.js             # Test environment setup
├── babel.config.js           # React JSX transformation
├── .gitignore                # Git exclusions
├── .dockerignore             # Docker exclusions
└── README.md                 # Quick start guide
```

## Technical Stack

### Frontend
- **React** 18.2.0 - UI library
- **React Scripts** 5.0.1 - Build tooling
- **React Testing Library** 14.0.0 - Component testing
- **CSS** - Custom styling (no UI libraries)

### Backend
- **Express** 4.18.2 - Web framework
- **CORS** 2.8.5 - Cross-origin support
- **Node.js** 18 - Runtime

### Testing
- **Jest** 29.5.0 - Test framework
- **Supertest** 6.3.3 - HTTP testing
- **jsdom** 22.0.0 - DOM testing
- **@testing-library/react** 14.0.0 - React component testing
- **@testing-library/jest-dom** 5.16.5 - Custom matchers
- **Babel** 7.22.0 - JSX transformation

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **serve** - Static file server for production
- **Alpine Linux** - Lightweight base images

## Key Features Implemented

### Validation & Error Handling
- ✅ Question required validation
- ✅ 2-5 options enforcement
- ✅ Empty option string rejection (backend validation)
- ✅ Invalid option index rejection (including NaN, floats, null)
- ✅ Poll not found (404) handling
- ✅ Frontend sends all options to backend (no bypassing)

### Percentage Calculation
- ✅ Backend-calculated percentages
- ✅ Always sums to exactly 100%
- ✅ Largest remainder method for rounding
- ✅ Handles zero votes (0%, not NaN)
- ✅ Handles ties correctly

### User Experience
- ✅ One vote per poll (localStorage only, no IP tracking)
- ✅ Clear localStorage allows voting again (new "user")
- ✅ Immediate results after voting
- ✅ Winner highlighting
- ✅ Tie highlighting (all tied options)
- ✅ Shareable poll links with copy-to-clipboard
- ✅ Persistent voting state (survives refresh)
- ✅ Real-time error messages from backend

### DevOps & Testing
- ✅ Comprehensive test coverage (59 tests, 91.66% coverage)
- ✅ React component testing with Testing Library
- ✅ Automated evaluation with JSON reports
- ✅ Docker one-command deployment
- ✅ Separate test and evaluation services
- ✅ Production-ready containerization
- ✅ Multi-project Jest configuration (backend + frontend)

## Usage Commands

### Development (Local)
```bash
# Install all dependencies (root, server, client)
npm run install:all

# Run both server and client together
npm run dev

# Run server only (port 3001)
npm run server

# Run client only (port 3000)
npm run client

# Run all tests (59 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run evaluation
npm run evaluate
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Docker

#### Run Production Application
```bash
# Start both server and client
docker-compose up server client

# Start in background (detached mode)
docker-compose up -d server client

# Rebuild and start
docker-compose up --build server client
```

#### Run Tests
```bash
# Run all tests in Docker
docker-compose up test

# Run tests with rebuild
docker-compose up --build test
```

#### Run Evaluation
```bash
# Run evaluation (generates JSON report)
docker-compose up evaluation --build
```

#### Docker Management
```bash
# View logs
docker-compose logs -f server
docker-compose logs -f client

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# View running containers
docker-compose ps

# Restart services
docker-compose restart server client
```

### Docker Services Available

1. **server** - Express backend (port 3001)
2. **client** - React frontend with serve (port 3000)
3. **test** - Run Jest tests
4. **evaluation** - Run evaluation with JSON report

## Design Decisions

1. **Separate package.json files**: Optimizes Docker image sizes and build caching
2. **In-memory storage**: Simplifies implementation (can be replaced with database)
3. **localStorage-only voting restriction**: Frontend-only tracking, no IP or backend voter tracking (allows "clear localStorage and vote again" behavior)
4. **Backend percentage calculation**: Ensures consistency and accuracy
5. **Short poll IDs**: User-friendly (ABC123 vs UUID)
6. **No external UI libraries**: Demonstrates core React/Express skills
7. **serve package for production**: Lightweight static file server
8. **All tests in workspace-level tests/**: Centralized test organization
10. **Multi-project Jest config**: Separate environments for backend (Node) and frontend (jsdom)
11. **React Testing Library**: Modern component testing approach
12. **Backend validation enforcement**: Frontend doesn't bypass validation

## Test Coverage Details

```
Test Suites: 4 passed, 4 total
Tests:       59 passed, 59 total
Snapshots:   0 total

Coverage:
- Statements:   91.66%
- Branches:     84.53%
- Functions:    94.59%
- Lines:        92.06%
```

### Test Breakdown:
- **Backend API Tests** (18): Poll creation, voting, validation, HTTP status codes, no voter tracking
- **Backend Logic Tests** (10): localStorage, winner calculation, option ordering
- **Poll Component Tests** (27): UI rendering, voting flow, results display, localStorage persistence
- **CreatePoll Component Tests** (13): Form validation, backend error handling

## Conclusion

This implementation provides a **production-ready polling application** with:
- ✅ Clean, maintainable code
- ✅ Comprehensive testing (59 tests, 91.66% coverage)
- ✅ Docker containerization for easy deployment
- ✅ Industry best practices
- ✅ React component testing with Testing Library
- ✅ Backend validation enforcement
- ✅ localStorage-only vote tracking (no IP tracking)
- ✅ Edge case handling (NaN, floats, null)
- ✅ Lightweight production deployment with serve