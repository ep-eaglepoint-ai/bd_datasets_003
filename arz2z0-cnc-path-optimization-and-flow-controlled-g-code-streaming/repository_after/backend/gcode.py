from typing import List
from .models import Segment, Point

class GCodeGenerator:
    @staticmethod
    def generate(segments: List[Segment], feed_rate: int = 1000) -> List[str]:
        gcode = []
        gcode.append("G21")  # Metric units
        gcode.append("G90")  # Absolute positioning
        gcode.append(f"F{feed_rate}") # Set feed rate
        
        current_pos = Point(x=0.0, y=0.0)
        
        for seg in segments:
            # Traveling to start of segment (G0) if not already there
            if current_pos.x != seg.p1.x or current_pos.y != seg.p1.y:
                gcode.append(f"G0 X{seg.p1.x:.3f} Y{seg.p1.y:.3f}")
            
            # Cutting to end of segment (G1)
            gcode.append(f"G1 X{seg.p2.x:.3f} Y{seg.p2.y:.3f}")
            
            current_pos = seg.p2
            
        # Homming at end? Optional but good practice.
        gcode.append("G0 X0 Y0")
        
        return gcode
