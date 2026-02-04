
import logging
from typing import List
from xml.dom import minidom
from svg.path import parse_path, Line, Path, Arc, CubicBezier, QuadraticBezier, Move
from .models import Segment, Point

logger = logging.getLogger("CNC-Backend")

class SVGParser:
    @staticmethod
    def parse_svg(svg_content: str, linearization_steps: int = 10) -> List[Segment]:
        """
        Parses SVG content and converts standard shapes/paths into linear Segments.
        Curves are approximated by linear interpolation.
        """
        segments = []
        try:
            doc = minidom.parseString(svg_content)
            paths = doc.getElementsByTagName('path')
            
            seg_id = 0
            
            for p_elem in paths:
                d = p_elem.getAttribute('d')
                if not d:
                    continue
                    
                parsed_path = parse_path(d)
                
                for item in parsed_path:
                    # Skip Moves (just positioning)
                    if isinstance(item, Move):
                        continue
                        
                    # If it's a Line, just take start/end
                    if isinstance(item, Line):
                        p1 = Point(x=item.start.real, y=item.start.imag)
                        p2 = Point(x=item.end.real, y=item.end.imag)
                        segments.append(Segment(id=seg_id, p1=p1, p2=p2))
                        seg_id += 1
                    else:
                        # Curve (Arc, Bezier) - Linearize
                        # Determine number of steps based on length? Or fixed steps.
                        # Simple approach: Fixed steps for now.
                        steps = linearization_steps
                        
                        start_point = item.point(0)
                        
                        for i in range(1, steps + 1):
                            t = i / steps
                            end_point = item.point(t)
                            
                            p1 = Point(x=start_point.real, y=start_point.imag)
                            p2 = Point(x=end_point.real, y=end_point.imag)
                            segments.append(Segment(id=seg_id, p1=p1, p2=p2))
                            seg_id += 1
                            
                            start_point = end_point
                            
            logger.info(f"Parsed SVG into {len(segments)} segments.")
            return segments
            
        except Exception as e:
            logger.error(f"SVG Parsing Error: {e}")
            raise ValueError(f"Failed to parse SVG: {e}")
