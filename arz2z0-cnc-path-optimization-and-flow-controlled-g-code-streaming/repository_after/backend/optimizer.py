from typing import List
from .models import Segment, Point

class PathOptimizer:
    @staticmethod
    def optimize(segments: List[Segment]) -> List[Segment]:
        if not segments:
            return []

        # Start at (0,0) or just the first segment's start? 
        # Requirement says: "The entry point of the next segment should be physically closest 
        # to the exit point of the previous segment."
        # We can assume starting state is at (0,0) or valid G-Code home. 
        # Let's assume the machine starts at (0,0).
        
        current_pos = Point(x=0.0, y=0.0)
        
        remaining_segments = segments[:]
        optimized_segments = []
        
        while remaining_segments:
            best_segment = None
            best_segment_idx = -1
            min_dist = float('inf')
            reverse_best = False
            
            for i, seg in enumerate(remaining_segments):
                # Distance from current_pos to seg.p1
                dist_p1 = current_pos.distance_to(seg.p1)
                
                # Check if we should reverse the segment (cut from p2 to p1)?
                # SVG paths usually have direction, but for laser cutting simple lines, direction might not matter 
                # UNLESS it matters for the design. 
                # The prompt says: "The entry point of the next segment should be physically closest to the exit point of the previous segment."
                # It doesn't explicitly allow reversing segments. 
                # "Raw SVG files typically define paths...". 
                # Usually standard cutting respects direction, but optimization often allows reversal.
                # Let's stick to start-to-end for now to be safe, unless "Nearest Neighbor" implies checking both ends.
                # "The entry point of the next segment..." implies the Start of the next segment.
                # Let's simple check distance to p1.
                
                if dist_p1 < min_dist:
                    min_dist = dist_p1
                    best_segment = seg
                    best_segment_idx = i
                    
            # Add to optimized
            optimized_segments.append(best_segment)
            
            # Update current pos to be the end of this segment
            current_pos = best_segment.p2
            
            # Remove from remaining
            remaining_segments.pop(best_segment_idx)
            
        return optimized_segments
