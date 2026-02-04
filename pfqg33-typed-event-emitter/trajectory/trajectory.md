# Trajectory

Trajectory: Typed Event Emitter
1. The Problem: "Type-Unsafe Event Handling"
Initially, the project was a blank slate. Standard event emitters often suffer from "stringly-typed" APIs, where any string can be an event name and any data can be passed as a payload. This leads to runtime crashes and difficult debugging. The goal was to build a robust, Type-Safe system where the compiler knows exactly what data belongs to which event.

2. The Solution: Generic Mapping & Safe Execution
I decided to use a Generic TypeScript Class approach to ensure data integrity.

Strict Contracts: By using a generic type T extends Record<string, any[]>, I created a contract where every event name is mapped to a specific array of arguments.

The "Safety" Engine: Beyond just types, I built a logic engine that focuses on Isolation. I ensured that if one listener fails, it doesn't kill the entire event cycle, keeping the system resilient.

3. Implementation Steps
Type Architecture: I researched how to use TypeScript generics to restrict event names. I implemented the on and off methods using these generics so that the IDE provides autocomplete and error checking for event payloads.

The "Once" Wrapper: I implemented a closure-based wrapper. This ensures the frontend doesn't have to manually manage clean-up—the listener "self-destructs" by calling off the moment it is triggered.

Reentrancy Logic: I learned that modifying an array while looping over it (e.g., a listener removing itself) causes index bugs. I used Array Shadowing (the spread operator [...handlers]) to create a "snapshot" of the listeners before execution.

4. Why I did it this way (Refinement)
I initially thought about letting errors propagate up to the main application.

Correction: I realized this was dangerous for an event system. If one third-party plugin or minor listener crashes, it shouldn't stop critical system events. I moved the execution into a try...catch block inside the emit loop. This keeps the application "live" even when individual listeners fail.

5. Testing & Debugging
The biggest hurdle was the "ModuleNotFoundError: uuid" during the Docker evaluation. I had to research how Docker volumes "hide" files installed during the build process. I fixed this by using a specialized Docker command that installs dependencies into the container's /tmp directory and sets the NODE_PATH, ensuring a clean run without cluttering the project root. This finally gave me the Success: True result.

📚 Recommended Resources
1. Watch: TypeScript Generics Explained

[YouTube: Learn TypeScript Generics In 13 Minutes](https://youtu.be/EcCTIExsqmI?si=AR3DSGUgEa2cnq9c)

2. Watch: The Event Loop & Callbacks

[YouTube: What the heck is the event loop anyway?](https://youtu.be/8aGhZQkoFbQ?si=J-eT1IyGUSzQo4wV) 

3. Read: What is an Event-Driven Architecture?

[Wikipedia: Event-driven architecture](https://en.wikipedia.org/wiki/Event-driven_architecture)

4. Read: The Observer Pattern

[Wikipedia: Observer pattern](https://en.wikipedia.org/wiki/Observer_pattern)