from typing import List, Tuple
from .models import Segment, Point

class PathOptimizer:
    @staticmethod
    def optimize(segments: List[Segment]) -> List[Segment]:
        """
        Optimize segment order using Nearest Neighbor Heuristic.
        Also considers reversing segments (using p2 as entry point) to minimize air travel.
        """
        if not segments:
            return []

        # Start at (0,0) - machine home position
        current_pos = Point(x=0.0, y=0.0)
        
        remaining_segments = segments[:]
        optimized_segments = []
        
        while remaining_segments:
            best_segment = None
            best_segment_idx = -1
            min_dist = float('inf')
            should_reverse = False
            
            for i, seg in enumerate(remaining_segments):
                # Distance from current_pos to seg.p1 (normal direction)
                dist_p1 = current_pos.distance_to(seg.p1)
                
                # Distance from current_pos to seg.p2 (reversed direction)
                dist_p2 = current_pos.distance_to(seg.p2)
                
                # Check normal direction
                if dist_p1 < min_dist:
                    min_dist = dist_p1
                    best_segment = seg
                    best_segment_idx = i
                    should_reverse = False
                
                # Check reversed direction (p2 as entry point)
                if dist_p2 < min_dist:
                    min_dist = dist_p2
                    best_segment = seg
                    best_segment_idx = i
                    should_reverse = True
            
            # Create the segment (possibly reversed)
            if should_reverse:
                # Reverse the segment: swap p1 and p2
                reversed_seg = Segment(
                    id=best_segment.id,
                    p1=best_segment.p2,
                    p2=best_segment.p1
                )
                optimized_segments.append(reversed_seg)
                current_pos = reversed_seg.p2
            else:
                optimized_segments.append(best_segment)
                current_pos = best_segment.p2
            
            # Remove from remaining
            remaining_segments.pop(best_segment_idx)
            
        return optimized_segments
    
    @staticmethod
    def calculate_total_travel(segments: List[Segment], start_pos: Point = None) -> float:
        """
        Calculate total air travel distance (G0 moves) for a given segment order.
        """
        if not segments:
            return 0.0
        
        if start_pos is None:
            start_pos = Point(x=0.0, y=0.0)
        
        total_travel = 0.0
        current_pos = start_pos
        
        for seg in segments:
            # Travel from current position to segment start
            total_travel += current_pos.distance_to(seg.p1)
            # Update position to segment end
            current_pos = seg.p2
        
        return total_travel
