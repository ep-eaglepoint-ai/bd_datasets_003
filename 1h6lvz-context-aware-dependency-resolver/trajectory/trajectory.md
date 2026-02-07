# Problem-Solving Trajectory

1. Analyze the Dependency Hell Problem (Identify Limitations of Standard Resolvers):
   I analyzed the problem statement describing a modular CMS plugin system with 'Soft Conflicts' — conditional versioning rules that activate retroactively based on the presence of unrelated packages in the dependency graph. Standard topological sort algorithms fail here because they assume static constraints. A package that initially resolves to version 1.0 might need upgrading to 2.0 later when another package triggers a soft rule, potentially causing cascading changes throughout the graph. This creates a constraint satisfaction problem that requires iterative refinement until the solution stabilizes.
   Understanding constraint satisfaction problems in software: https://en.wikipedia.org/wiki/Constraint_satisfaction_problem

2. Define Core System Requirements:
   I established strict requirements: support SemVer comparison with >= and == operators, handle transitive dependencies through arbitrary depth, implement soft conflict logic that applies conditional overrides when trigger packages appear in the solution, detect hard conflicts when no version satisfies all constraints, identify circular dependencies (A→B→A) before resolution begins, and prevent infinite oscillation when rules cause flip-flopping state changes by enforcing a maximum iteration threshold.

3. Implement Custom SemVer Parser (Avoid External Dependencies):
   I built a Version class that parses semantic version strings (major.minor.patch) into comparable tuples. The implementation uses Python's tuple comparison semantics — comparing (1,2,3) with (1,2,4) naturally yields correct ordering without complex logic. I implemented all comparison operators (__eq__, __lt__, __le__, __gt__, __ge__) to support both equality checks and range comparisons. This approach has O(1) time complexity for all comparisons.
   Learn about semantic versioning specification: https://semver.org/

4. Build VersionConstraint Evaluator for Operators:
   I created a VersionConstraint class that parses constraint strings like ">=2.0.0" or "==1.5.0" into operator-version pairs. The satisfied_by() method applies the operator logic: for >=, it uses the __ge__ comparison operator; for ==, it uses strict equality. This abstraction separates parsing from evaluation, making the constraint logic reusable across the resolver. The design follows the Strategy pattern where each operator represents a different comparison strategy.

5. Design Iterative Resolution Algorithm (Fixed-Point Iteration):
   I implemented the core resolver using fixed-point iteration — repeatedly refining the solution until it stabilizes (reaches a fixed point where further iterations produce identical results). Each iteration: (1) collects all transitive dependencies using depth-first traversal, (2) applies soft rules based on currently resolved packages, (3) resolves versions by finding the highest version satisfying all constraints, and (4) compares the new solution to the previous one. When consecutive solutions match, the algorithm has converged and returns the stable solution.
   Fixed-point iteration explained: https://en.wikipedia.org/wiki/Fixed-point_iteration

6. Implement Circular Dependency Detection with DFS:
   I used a depth-first search with two tracking sets: visiting (packages currently in the call stack) and completed (packages fully processed). When visiting a package already in the visiting set, a cycle exists. I track the full path through recursive calls to provide descriptive error messages like "pkg-a -> pkg-b -> pkg-a" that help developers identify the problematic dependency chain. The algorithm has O(V+E) complexity where V is packages and E is dependency edges.
   Understanding cycle detection in directed graphs: https://en.wikipedia.org/wiki/Cycle_detection

7. Implement Soft Rule Application Logic:
   I built the soft rule engine to check if condition_package exists in either the current solution or the required packages set. When triggered, the rule appends an additional VersionConstraint to the target package's constraint list. This creates a dynamic constraint system where constraints accumulate based on graph state. The iterative outer loop ensures that adding new constraints (which might bring in new packages) triggers re-evaluation until all soft rules are satisfied and the graph stabilizes.

8. Build Multi-Constraint Resolution (Intersection of Ranges):
   I implemented version selection that finds the highest version satisfying all accumulated constraints simultaneously. The algorithm iterates through available versions in descending order (newest first), testing each against every constraint using the all() function. This finds the intersection of all constraint ranges — for example, [>=1.5.0, >=2.0.0, ==2.5.0] resolves to exactly 2.5.0. If no version satisfies all constraints, a hard conflict exists and resolution fails with a descriptive error listing the incompatible constraints.

9. Implement Hard Conflict Detection with Descriptive Errors:
   I added explicit hard conflict detection when no version of a package satisfies the combined constraint set. The error message includes the package name and all conflicting constraints (e.g., "No version of 'lib-auth' satisfies ['==1.0.0', '==2.0.0']") to help developers understand why resolution failed. This provides actionable feedback rather than silent failures or vague errors.

10. Add Oscillation Detection with Iteration Limit:
    I implemented an oscillation guard using a maximum iteration counter (default 100). If the algorithm runs MAX_ITERATIONS without converging, it raises an error indicating oscillation. True oscillation is rare with well-formed soft rules, but this prevents infinite loops in pathological cases where rules create cycles in the constraint space (e.g., Rule A enables Package X, Package X triggers Rule B which disables X). The iteration count also serves as a worst-case performance bound.

11. Result: Stable Iterative Resolver with Comprehensive Validation:
    The solution implements a constraint satisfaction algorithm that handles retroactive dependency changes through fixed-point iteration, supports standard transitive dependencies with O(V+E) graph traversal, detects circular dependencies before attempting resolution, identifies hard conflicts with detailed error messages, prevents infinite loops through iteration limits, and passes all test cases including complex cascade scenarios. The architecture separates concerns cleanly: Version handles comparison, VersionConstraint handles evaluation, and DependencyResolver orchestrates the iterative refinement process.
