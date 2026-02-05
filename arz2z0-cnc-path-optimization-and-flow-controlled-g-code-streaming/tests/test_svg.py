
import pytest
from backend.svg_parser import SVGParser
from backend.models import Segment

def test_svg_line_parsing():
    # Simple line
    svg = '<svg><path d="M 0 0 L 10 10" /></svg>'
    segments = SVGParser.parse_svg(svg)
    assert len(segments) == 1
    assert segments[0].p1.x == 0
    assert segments[0].p1.y == 0
    assert segments[0].p2.x == 10
    assert segments[0].p2.y == 10

def test_svg_curve_approximation():
    # Curve (Quadratic Bezier)
    # M 0 0 Q 5 10 10 0
    svg = '<svg><path d="M 0 0 Q 5 10 10 0" /></svg>'
    segments = SVGParser.parse_svg(svg, linearization_steps=10)
    
    # Should result in 10 linear segments
    assert len(segments) == 10
    
    # Start of first should be 0,0
    assert segments[0].p1.x == 0
    assert segments[0].p1.y == 0
    
    # End of last should be 10,0
    assert abs(segments[-1].p2.x - 10) < 0.001
    assert abs(segments[-1].p2.y - 0) < 0.001

def test_invalid_svg():
    with pytest.raises(ValueError):
        SVGParser.parse_svg("invalid xml")
