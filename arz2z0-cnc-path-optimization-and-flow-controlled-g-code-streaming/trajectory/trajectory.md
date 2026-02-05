# Trajectory (Thinking Process for Full-Stack Development)

1. **System & Product Flow Audit**
    I started by auditing the requirements to map the full system flow, identifying that raw SVG paths (input) needed to be optimized for a physical machine (output) via a G-Code stream. I realized the core engineering challenge was preventing buffer overflows on the hardware, which dictated a responsive, non-blocking backend architecture.
    
    *Learn about Event Loops and Concurrency for system flow:*
    [https://docs.python.org/3/library/asyncio-task.html](https://docs.python.org/3/library/asyncio-task.html)

2. **Define API, UX, and Data Contracts**
    I established strict contracts for the WebSocket communication ("Stop-and-Wait") and the data models (`Point`, `Segment`) to ensure the frontend and backend remained synchronized. I defined the user experience requirements: real-time "Printing" status updates and a visualizer that clearly distinguishes "Cut" from "Travel" moves to prove optimization efficiency.
    
    *WebSocket Protocol Design patterns:*
    [https://websockets.readthedocs.io/en/stable/](https://websockets.readthedocs.io/en/stable/)

3. **Data Model Refactor (DTOs & Frontend State Shape)**
    I designed the Pydantic models to serve as the single source of truth for the backend, and mirrored this shape in the React frontend state. This ensured that the `segments` loaded into memory for optimization were identical to those rendered on the Canvas, guaranteeing true-to-life visualization.
    
    *Pydantic Models for Data Validation:*
    [https://docs.pydantic.dev/latest/](https://docs.pydantic.dev/latest/)

4. **API Payload Shaping (Optimization)**
    I implemented the Nearest Neighbor heuristic to reshape the execution order of the G-Code payload. By treating the G-Code generation as a payload optimization problem, I ensured the machine received the most efficient path possible, directly addressing the requirement to minimize air travel.
    
    *Nearest Neighbor Algorithm for TSP:*
    [https://en.wikipedia.org/wiki/Nearest_neighbour_algorithm](https://en.wikipedia.org/wiki/Nearest_neighbour_algorithm)

5. **Backend & UI Pagination (Flow Control)**
    I implemented a "Drip Feed" flow control mechanism that acts as a form of pagination for the G-Code stream. Instead of sending the entire file (which would crash the machine), I "paginated" the output into single-command chunks, gated by hardware acknowledgment, while the UI updated progressively.
    
    *Flow Control in Network Protocols:*
    [https://en.wikipedia.org/wiki/Stop-and-wait_ARQ](https://en.wikipedia.org/wiki/Stop-and-wait_ARQ)

6. **API Schemas, Data Flow, and Latency Budgets**
    I finalized the system by enforcing latency budgets through the simulated `Machine` class. I validated that the non-blocking `asyncio` implementation could handle the 50ms-100ms hardware latency without freezing the API, ensuring the system met its performance contract.
    
    *Testing Asyncio with Pytest:*
    [https://pytest-asyncio.readthedocs.io/en/latest/](https://pytest-asyncio.readthedocs.io/en/latest/)
