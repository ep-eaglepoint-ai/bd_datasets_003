class Particle:
    def __init__(self, id, x, y, radius):
        self.id = id
        self.x = x
        self.y = y
        self.radius = radius

def detect_collisions(particles):
    collisions = set()
    # Performance Bottleneck: O(N^2)
    for i in range(len(particles)):
        for j in range(i + 1, len(particles)):
            p1 = particles[i]
            p2 = particles[j]
            # Euclidean distance check
            dx = p1.x - p2.x
            dy = p1.y - p2.y
            dist_sq = dx*dx + dy*dy
            radii_sum = p1.radius + p2.radius
            if dist_sq < radii_sum * radii_sum:
                # Store collision as tuple of IDs (smaller_id, larger_id)
                collisions.add(tuple(sorted((p1.id, p2.id))))
    return collisions