## Trajectory: Building a Temporal Paradox Meeting Scheduler

### **Problem: Temporal Ambiguity and Logical Paradoxes**

Traditional meeting schedulers work with concrete, absolute times. Users say "2 PM tomorrow" and the system checks availability. But what if the requirement is: _"Schedule 2 hours after the earlier of the two most recent cancellations, but only if that doesn't fall within 30 minutes of a recurring lunch that moves based on the previous day's workload"_?

This creates three core challenges:

1. **Ambiguous References**: Terms like "earlier of," "most recent," "unless," "provided" require contextual understanding
2. **Dynamic State**: Lunch time isn't fixed—it moves based on yesterday's workload
3. **Temporal Paradoxes**: Rules can create logical contradictions like circular dependencies or impossible time windows

### **Solution: A Three-Layer Temporal Reasoning Engine**

I built a system that thinks like a human scheduling assistant who understands relative time, remembers historical events, and spots logical inconsistencies.

#### **Layer 1: The Parser (Understanding What You Mean)**

**Problem**: How do we turn natural language-like rules into something a computer can process?
**Solution**: A custom parser that works like a translator:

1. **Tokenization**: Breaks "2 hours after last cancellation" into pieces: ["2", "hours", "after", "last cancellation"]
2. **Grammar Rules**: Recognizes patterns like "X [unit] [operator] [reference]" or "[operator] of [A] and [B]"
3. **AST Generation**: Creates a tree structure where "earlier of A and B" becomes a node with two children

#### **Layer 2: The Event Log (Remembering What Happened)**

**Problem**: How do we track historical events that influence future scheduling?
**Solution**: A persistent event database that works like organizational memory:

- **Last Cancellation**: Timestamp + metadata
- **Last Deployment**: When it happened, was it successful?
- **Critical Incidents**: Severity, resolution status
- **Workload Data**: For calculating moving lunch times

#### **Layer 3: The Paradox Detector (Spotting Logical Traps)**

**Problem**: How do we prevent scheduling impossibilities?
**Solution**: Six specialized detectors looking for different types of temporal paradoxes:

1. **Circular Dependencies**: "After A unless before A" creates a loop
2. **Time Travel**: References to events that haven't happened yet
3. **Impossible Windows**: "Between 3 PM and 2 PM" can't exist
4. **Conflicting Conditions**: "After X and before X" for the same X
5. **Self-Referential**: Rules that reference themselves
6. **Past Scheduling**: Trying to schedule meetings in the past

### **The Implementation Journey**

#### **Phase 1: Building the Foundation ("What")**

I started with data models—defining what a meeting request looks like, what participants are, what historical events we track. This was like designing the forms before building the office.

#### **Phase 2: Creating the Parser ("How")**

The parser was the hardest part. I tried different regex patterns before settling on a tokenizer + grammar approach.

**Aha Moment**: Realizing we needed to handle nested conditions. "Unless within 30 minutes of lunch" is a condition inside the main rule. We built recursive parsing to handle this.

#### **Phase 3: Adding Intelligence ("Why")**

The paradox detector makes this system smart. Without it, users could create impossible schedules.

#### **Phase 4: Mocking External Dependencies ("Real World")**

We can't call real APIs during development, so we created mock versions:

- **WorkloadAPI**: Returns 75% workload (mock value)
- **IncidentAPI**: Returns "last incident was 18 hours ago" (mock data)

#### **Phase 5: API Layer ("Front Door")**

We wrapped everything in a FastAPI application with a single `/schedule` endpoint. Clean, simple interface hiding complex internal logic.

**Design Choice**: One endpoint for simplicity. The complexity is in the request payload, not the API structure.

### **Testing Strategy: Proving It Works**

With complex temporal logic, testing is critical. We built 25+ test scenarios:

1. **Happy Paths**: Simple rules that should work
2. **Paradox Tests**: Rules that should fail with specific errors
3. **Edge Cases**: Zero duration, no participants, very long meetings
4. **Integration Tests**: Full API calls with mocked responses

### **Recommended Resources**

**Watch: FastAPI Crash Course to Build a REST API**:
https://www.youtube.com/watch?v=iWS9ogMPOI0

**Read: TinyDB docs**:
https://tinydb.readthedocs.io/en/latest/

**Read: Temporal Logic**:
https://cs.lmu.edu/~ray/notes/temporallogic/

**Read: The Complexity of Natural Language**:
https://aclanthology.org/W18-4602.pdf
