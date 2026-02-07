Thread-Safe Snowflake ID Generator (JNCRLA)

Project Context

The goal is to implement a high-throughput, thread-safe distributed ID generator based on the Snowflake algorithm in Python. The system must produce 64-bit, time-sortable unique IDs (custom epoch Jan 1, 2024), use a lock for thread safety, block until the next millisecond when the sequence overflows in the same ms, and raise ClockMovedBackwardsError on clock rollback. Implementation lives in repository_after/; tests in tests/.

Commands

1. Setup Environment

Builds the Python container and installs dependencies.

<before command>

<after command>

<evaluation command>
