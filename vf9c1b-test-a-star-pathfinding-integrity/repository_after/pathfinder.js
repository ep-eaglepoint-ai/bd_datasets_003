
// # filename: pathfinder.js
// No external dependencies are used for the core logic to ensure low-latency execution.

function findPath(grid, start, end) {
    const [startX, startY] = start;
    const [endX, endY] = end;
    const rows = grid.length;
    const cols = grid[0].length;

    const openSet = [{ x: startX, y: startY, g: 0, f: 0, parent: null }];
    const closedSet = []; // Potential performance bottleneck or logic error location

    const getHeuristic = (x, y) => {
        // Manhattan distance: |x1 - x2| + |y1 - y2|
        return Math.abs(x - endX) + Math.abs(y - endY);
    };

    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();

        if (current.x === endX && current.y === endY) {
            const path = [];
            let temp = current;
            while (temp) {
                path.push([temp.x, temp.y]);
                temp = temp.parent;
            }
            return path.reverse();
        }

        closedSet.push(current);

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= cols || neighbor.y < 0 || neighbor.y >= rows) continue;
            if (grid[neighbor.y][neighbor.x] === Infinity) continue;

            const weight = grid[neighbor.y][neighbor.x];
            const gScore = current.g + weight;

            const existingInOpen = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);
            if (existingInOpen && gScore >= existingInOpen.g) continue;

            // The logic below is suspected of failing to check the closedSet correctly for zero-cost tiles
            neighbor.g = gScore;
            neighbor.f = gScore + getHeuristic(neighbor.x, neighbor.y);
            neighbor.parent = current;
            openSet.push(neighbor);
        }
    }
    return null;
}

module.exports = { findPath };
