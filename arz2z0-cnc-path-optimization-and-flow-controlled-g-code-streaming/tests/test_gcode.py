from backend.gcode import GCodeGenerator
from backend.models import Segment, Point

def test_gcode_format():
    segs = [Segment(id=1, p1=Point(x=10, y=10), p2=Point(x=20, y=20))]
    gcode = GCodeGenerator.generate(segs)
    
    assert "G21" in gcode
    assert "G90" in gcode
    # Travel to start
    assert "G0 X10.000 Y10.000" in gcode
    # Cut
    assert "G1 X20.000 Y20.000" in gcode
    # Home
    assert "G0 X0 Y0" in gcode

def test_gcode_continuity_no_redundant_travel():
    """
    Test that no redundant G0 moves are generated when segments are continuous.
    If one segment ends where the next begins, no G0 travel should be needed.
    """
    segs = [
        Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=10)),
        Segment(id=2, p1=Point(x=10, y=10), p2=Point(x=20, y=20))
    ]
    
    gcode = GCodeGenerator.generate(segs)
    
    # Expected structure:
    # G21 (metric)
    # G90 (absolute)
    # F1000 (feed rate)
    # [No G0 needed - first segment starts at 0,0 which is current pos]
    # G1 X10.000 Y10.000 (cut first segment)
    # [No G0 needed - second segment starts where first ends]
    # G1 X20.000 Y20.000 (cut second segment)
    # G0 X0 Y0 (home)
    
    # Count G0 commands (excluding the final home command)
    g0_lines = [line for line in gcode if line.startswith("G0")]
    g1_lines = [line for line in gcode if line.startswith("G1")]
    
    # Should have exactly 1 G0 (the final home command)
    assert len(g0_lines) == 1, f"Expected 1 G0 (home), got {len(g0_lines)}: {g0_lines}"
    
    # Should have exactly 2 G1 commands (one per segment)
    assert len(g1_lines) == 2, f"Expected 2 G1 cuts, got {len(g1_lines)}: {g1_lines}"
    
    # The only G0 should be the home command
    assert g0_lines[0] == "G0 X0 Y0", f"G0 should be home command, got: {g0_lines[0]}"

def test_gcode_generates_travel_for_discontinuous_segments():
    """
    Test that G0 travel moves are generated when segments are not continuous.
    """
    segs = [
        Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=10)),
        Segment(id=2, p1=Point(x=50, y=50), p2=Point(x=60, y=60))  # Not continuous!
    ]
    
    gcode = GCodeGenerator.generate(segs)
    
    # Should have G0 travel to second segment start
    assert "G0 X50.000 Y50.000" in gcode, "Should have travel move to second segment"
    
    # Count G0 commands
    g0_lines = [line for line in gcode if line.startswith("G0")]
    
    # Should have 2 G0 commands: travel to seg2 start + home
    assert len(g0_lines) == 2, f"Expected 2 G0 commands, got {len(g0_lines)}: {g0_lines}"

def test_gcode_converts_coordinates_to_g0_g1():
    """
    Req 7: System must accept raw line segment coordinates (x1, y1, x2, y2) 
    and convert them to G0 X.. Y.. and G1 X.. Y..
    """
    # Input: raw coordinates
    x1, y1, x2, y2 = 15.5, 25.5, 35.5, 45.5
    
    seg = Segment(id=1, p1=Point(x=x1, y=y1), p2=Point(x=x2, y=y2))
    gcode = GCodeGenerator.generate([seg])
    
    # Should have G0 travel to start
    assert "G0 X15.500 Y25.500" in gcode, "Should have G0 travel to segment start"
    
    # Should have G1 cut to end
    assert "G1 X35.500 Y45.500" in gcode, "Should have G1 cut to segment end"

def test_gcode_feed_rate_configuration():
    """Test that feed rate can be configured."""
    segs = [Segment(id=1, p1=Point(x=10, y=10), p2=Point(x=20, y=20))]
    
    # Default feed rate
    gcode_default = GCodeGenerator.generate(segs)
    assert "F1000" in gcode_default
    
    # Custom feed rate
    gcode_custom = GCodeGenerator.generate(segs, feed_rate=500)
    assert "F500" in gcode_custom

def test_gcode_output_order():
    """Test that G-code lines are in correct order."""
    segs = [Segment(id=1, p1=Point(x=10, y=10), p2=Point(x=20, y=20))]
    gcode = GCodeGenerator.generate(segs)
    
    # Find indices
    g21_idx = gcode.index("G21")
    g90_idx = gcode.index("G90")
    
    # G21 and G90 should be at the start
    assert g21_idx == 0, "G21 should be first"
    assert g90_idx == 1, "G90 should be second"
    
    # Last line should be home
    assert gcode[-1] == "G0 X0 Y0", "Last line should be home"
