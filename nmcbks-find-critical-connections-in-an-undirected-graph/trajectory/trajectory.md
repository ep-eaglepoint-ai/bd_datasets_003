# Trajectory

A bridge is an edge whose removal increases the number of connected components.
Uses Tarjan's bridge-finding algorithm with DFS.
Algorithm:

- Maintain disc[u]: discovery time of node u
- Maintain low[u]: earliest reachable node from u's subtree
- Edge (u, v) is a bridge iff low[v] > disc[u] (for tree edge u→v)
  Key insight: For correct low-link updates:
- For child v: low[u] = min(low[u], low[v])
- For back edge to ancestor v: low[u] = min(low[u], disc[v])
  Args:
  n: Number of nodes (0 to n-1)
  edges: List of undirected edges [u, v]
  Returns:
  Dictionary with key 'bridges' containing list of bridges [[u, v], ...]
  where u < v, sorted by node indices
  Time Complexity: O(n + m) where m is number of edges
  Space Complexity: O(n + m) for adjacency list and arrays
  """

## Analysis

The problem requires identifying bridges in an undirected graph—edges whose removal disconnects the graph. The docstring indicates we need to distinguish tree edges from back edges and track discovery and low-link values to identify critical connections.

## Strategy

Tarjan's algorithm was chosen because it:

- Solves bridge detection in a single DFS pass (O(n + m))
- Efficiently tracks reachability using low-link values
- Avoids redundant edge checks by classifying edges during traversal
- Outperforms naive approaches that repeatedly search for connectivity

## Execution

1. Initialize `disc` and `low` arrays to track discovery times and earliest reachable ancestors
2. Perform DFS from unvisited nodes, incrementing a time counter at each visit
3. For each neighbor:
   - If unvisited: recurse and update `low[u] = min(low[u], low[v])`
   - If visited and not the parent: update `low[u] = min(low[u], disc[v])` for back edges
4. Identify bridges when `low[v] > disc[u]` for tree edges
5. Return bridges sorted with smaller node index first

## Resources

- [Tarjan's Bridge-Finding Algorithm](https://en.wikipedia.org/wiki/Bridge_%28graph_theory%29#Tarjan's_algorithm)
- [DFS and Low-Link Values](https://cp-algorithms.com/graph/bridge-finding.html)
- [Graph Theory Fundamentals](https://en.wikipedia.org/wiki/Graph_theory)
