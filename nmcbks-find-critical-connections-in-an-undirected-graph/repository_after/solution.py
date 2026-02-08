from typing import List, Dict

# Use iterative DFS with edge-based representation to:
# 1. Correctly handle multigraphs (parallel edges) - skip only the edge we came from by edge_id
# 2. Avoid recursion depth issues for large graphs (n ~ 10^5)


def find_bridges(n: int, edges: List[List[int]]) -> Dict[str, List[List[int]]]:
    # Build adjacency list with edge indices: graph[u] = [(v, edge_id), ...]
    # So we only skip the exact edge we came from, not all edges to parent (required for multigraphs)
    graph = [[] for _ in range(n)]
    for eid, (u, v) in enumerate(edges):
        graph[u].append((v, eid))
        graph[v].append((u, eid))

    disc = [-1] * n
    low = [-1] * n
    bridges = []
    timer = 0

    for start in range(n):
        if disc[start] != -1:
            continue
        # Iterative DFS stack: (u, parent_vertex, parent_edge_id, next_adj_index)
        stack = [(start, -1, -1, 0)]
        while stack:
            u, p, pe, i = stack.pop()

            if i == 0:
                # First time entering u
                disc[u] = low[u] = timer
                timer += 1

            if i > 0:
                # Returning from child: graph[u][i-1] is the edge we came back from
                v, _ = graph[u][i - 1]
                low[u] = min(low[u], low[v])
                if low[v] > disc[u]:
                    a, b = min(u, v), max(u, v)
                    bridges.append([a, b])

            # Advance to next adjacency
            while i < len(graph[u]):
                v, e = graph[u][i]
                if (v, e) == (p, pe):
                    # Same edge we came from (only skip this one)
                    i += 1
                    continue
                if disc[v] != -1:
                    # Back edge (or parallel edge to already-visited node)
                    low[u] = min(low[u], disc[v])
                    i += 1
                    continue
                # Tree edge: schedule return to u at i+1, then go to v
                stack.append((u, p, pe, i + 1))
                stack.append((v, u, e, 0))
                break
            else:
                # No more neighbors; if we had pushed a "return" frame it's already on stack
                pass

    bridges.sort(key=lambda x: (x[0], x[1]))
    return {"bridges": bridges}


def verify_bridge(n: int, edges: List[List[int]], bridge: List[int]) -> bool:
    graph = [[] for _ in range(n)]
    for u, v in edges:
        if (u == bridge[0] and v == bridge[1]) or (u == bridge[1] and v == bridge[0]):
            continue
        graph[u].append(v)
        graph[v].append(u)

    visited = [False] * n
    components = 0

    def bfs(start: int) -> None:
        queue = [start]
        visited[start] = True
        while queue:
            u = queue.pop(0)
            for v in graph[u]:
                if not visited[v]:
                    visited[v] = True
                    queue.append(v)

    for i in range(n):
        if not visited[i]:
            bfs(i)
            components += 1

    return components > 1


if __name__ == "__main__":
    print("Example 1:")
    result1 = find_bridges(4, [[0, 1], [1, 2], [2, 0], [1, 3]])
    print(f"Input: n=4, edges=[[0,1],[1,2],[2,0],[1,3]]")
    print(f"Output: {result1}")
    print()

    print("Example 2:")
    result2 = find_bridges(2, [[0, 1]])
    print(f"Output: {result2}")
    print()

    print("Example 3 (no bridges):")
    result3 = find_bridges(5, [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 1]])
    print(f"Output: {result3}")
    print()

    print("Example 4:")
    result4 = find_bridges(6, [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3]])
    print(f"Output: {result4}")
    print()

    print("Parallel edges (multigraph):")
    result5 = find_bridges(3, [[0, 1], [0, 1], [1, 2]])
    print(f"Output: {result5}")
