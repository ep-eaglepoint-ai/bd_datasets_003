# Trajectory: Discrete Physics Simulation of Roller Coaster Dynamics with Friction and G-Force Constraints

**Objective:** To architect a time-domain physics engine that certifies roller coaster safety by simulating non-conservative forces, dynamic G-loads, and derailment risks using discrete numerical integration.

---

### 1. Understand the Problem: The Conservation Trap

Since this tool replaces a legacy system, I start by identifying why simple energy-based models (PE to KE) are insufficient for safety certification.

- **Identify Non-Conservative Forces:** I recognize that air resistance ($v^2$) and rolling friction are velocity-dependent and must be integrated over time rather than calculated at static snapshots.
- **Analyze the Normal Force Trap:** I must solve for the instantaneous Normal Force ($N$), which is a dynamic sum of gravity and centripetal acceleration. I realize that on loops, $N$ varies constantly, affecting both friction magnitude and passenger safety.
- **Define Derailment:** I define a derailment risk as any point where $N < 0$ at the apex of a loop, meaning the centripetal force is insufficient to overcome gravity and the train would fall off the track.

### 2. Define a Safety & Physics Contract

Before implementation, I establish the physical constraints required for a robust simulation engine.

- **Numerical Stability:** I select a high-frequency discrete time-step ($dt = 0.002s$) to ensure that the numerical integration (Semi-Implicit Euler) remains accurate at high velocities.
- **Safety Bounds:** I define hard limits for passenger G-forces (e.g., +6.0G max to -1.5G min) and a stall threshold ($v < 1e-4$) to flag a failed course.
- **Geometric Integrity:** I mandate tangent continuity (smoothness). Any "kink" between segments must be rejected during the track compilation phase to prevent infinite instantaneous acceleration.

### 3. Rework the Data Model for Geometry (Track Compilation)

To make the simulation loop efficient ($O(1)$ lookup per step), I will pre-process the track into optimized simulation nodes.

- **Curvilinear Coordinates:** I will translate high-level `StraightSegment` and `ArcSegment` types into a continuous coordinate system based on distance ($s$).
- **Curvature Mapping:** I will calculate the signed curvature ($k = 1/r$) for every segment. This allows the simulation to calculate centripetal acceleration ($a_c = v^2 \cdot k$) instantly at any point on the path.
- **Smoothness Validation:** I will implement an automated "kink" check to ensure the exit angle of one segment matches the entry angle of the next within a strict tolerance.

### 4. Implement the Force Integration Pipeline

I will build the core loop to update the physical state of the train hundreds of times per second.

- **Force Decomposition:** For every time step, I calculate the current track angle ($\theta$). I decompose gravity into a parallel component (acceleration/deceleration) and a perpendicular component (Normal Force contribution).
- **Quadratic Drag:** I will implement aerodynamic drag proportional to the square of the current velocity ($v \cdot |v|$), ensuring it always opposes the direction of motion.
- **Dynamic Rolling Resistance:** Instead of a static friction value, I will calculate friction as $\mu \cdot N$. This ensures that as G-forces increase (at the bottom of a loop), the friction force increases proportionally.

### 5. Calculate Dynamic G-Loads & Derailment Risk

The engine must identify exactly why a procedurally generated track is unsafe.

- **Normal Force Monitoring:** I will calculate $N/m = v^2 \cdot k + g \cdot \cos(\theta)$. If this value drops below zero, the simulation immediately halts and flags a "Derailment Risk."
- **G-Force Tracking:** I will track the instantaneous G-load throughout the simulation. I must record the absolute minimum and maximum G-forces experienced to ensure passengers are not ejected (Negative Gs) or injured (Positive Gs).

### 6. Telemetry & Certification (The Safety Report)

My final step is to generate a detailed telemetry object that provides engineering feedback for the design suite.

- **State Monitoring:** If the train fails to reach the end of the segments because velocity drops to zero, I flag a "Stall."
- **Predictable Verification:** I will verify the engine by confirming that it detects the three primary failure modes: Stalls (not enough energy), Derailment (not enough speed in a loop), and G-Limit violations (too much speed in a valley).
- **Certification Signal:** The final `SafetyReport` will provide a boolean `passed` status based on the successful completion of the track within all safety parameters.
