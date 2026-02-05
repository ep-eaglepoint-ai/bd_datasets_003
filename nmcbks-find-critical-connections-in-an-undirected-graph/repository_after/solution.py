from typing import List, Dict


def find_bridges(n: int, edges: List[List[int]]) -> Dict[str, List[List[int]]]:
   
    # Build adjacency list
    graph = [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    # Initialize arrays
    disc = [-1] * n  # Discovery time
    low = [-1] * n   # Low-link value
    visited = [False] * n
    bridges = []
    timer = [0]  # Use list to maintain reference in nested function
    
    def dfs(u: int, parent: int) -> None:
        visited[u] = True
        disc[u] = low[u] = timer[0]
        timer[0] += 1
        
        for v in graph[u]:
            if v == parent:
                # Skip the edge to parent (undirected graph)
                continue
            
            if visited[v]:
                # Back edge: update low[u] with disc[v]
                # This is crucial - we use disc[v], NOT low[v]
                low[u] = min(low[u], disc[v])
            else:
                # Tree edge: recursively visit child
                dfs(v, u)
                
                # After DFS on child, update low[u] with low[v]
                low[u] = min(low[u], low[v])
                
                # Check if edge (u, v) is a bridge
                # Bridge condition: low[v] > disc[u]
                # Meaning v cannot reach any ancestor of u without using edge (u, v)
                if low[v] > disc[u]:
                    # Add bridge with u < v ordering
                    if u < v:
                        bridges.append([u, v])
                    else:
                        bridges.append([v, u])
    
    # Run DFS from all unvisited nodes (handles disconnected components if any)
    for i in range(n):
        if not visited[i]:
            dfs(i, -1)
    
    # Sort bridges: first by smaller node, then by larger node
    bridges.sort(key=lambda x: (x[0], x[1]))
    
    return {"bridges": bridges}


def verify_bridge(n: int, edges: List[List[int]], bridge: List[int]) -> bool:
    # Build graph without the bridge
    graph = [[] for _ in range(n)]
    for u, v in edges:
        if (u == bridge[0] and v == bridge[1]) or (u == bridge[1] and v == bridge[0]):
            continue  # Skip the bridge edge
        graph[u].append(v)
        graph[v].append(u)
    
    # Count connected components using BFS
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
    
    # If more than 1 component after removing edge, it's a bridge
    return components > 1


# Example usage and explanation
if __name__ == "__main__":
    # Example 1: Triangle with one bridge
    print("Example 1:")
    result1 = find_bridges(4, [[0, 1], [1, 2], [2, 0], [1, 3]])
    print(f"Input: n=4, edges=[[0,1],[1,2],[2,0],[1,3]]")
    print(f"Output: {result1}")
    print(f"Explanation: Edge (1,3) is the only bridge\n")
    
    # Example 2: Single edge
    print("Example 2:")
    result2 = find_bridges(2, [[0, 1]])
    print(f"Input: n=2, edges=[[0,1]]")
    print(f"Output: {result2}")
    print(f"Explanation: The only edge is a bridge\n")
    
    # Example 3: No bridges (all edges in cycles)
    print("Example 3:")
    result3 = find_bridges(5, [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 1]])
    print(f"Input: n=5, edges=[[0,1],[1,2],[2,0],[1,3],[3,4],[4,1]]")
    print(f"Output: {result3}")
    print(f"Explanation: No bridge; every edge is in a cycle\n")
    
    # Example 4: Two cycles connected by a bridge
    print("Example 4:")
    result4 = find_bridges(6, [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3]])
    print(f"Input: n=6, edges=[[0,1],[1,2],[2,0],[1,3],[3,4],[4,5],[5,3]]")
    print(f"Output: {result4}")
    print(f"Explanation: Triangle 0-1-2 and cycle 3-4-5-3; edge (1,3) is a bridge\n")