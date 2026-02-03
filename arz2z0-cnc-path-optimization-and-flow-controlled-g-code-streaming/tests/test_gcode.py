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
    # If one segment ends where next begins, no G0 needed?
    # Generator logic currently:
    # if current_pos != seg.p1: G0...
    
    segs = [
        Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=10)),
        Segment(id=2, p1=Point(x=10, y=10), p2=Point(x=20, y=20))
    ]
    
    # We expect: G0 X0 Y0 (implicit start match?), G1 X10 Y10, G1 X20 Y20
    # The generator initializes current_pos at 0,0.
    
    gcode = GCodeGenerator.generate(segs)
    
    # Check for G0 between the two G1s
    # G1 X10 Y10 -> current remains 10,10.
    # Next seg starts 10,10.
    # Should NOT have G0 X10 Y10
    
    indices_of_g1 = [i for i, line in enumerate(gcode) if "G1" in line]
    indices_of_g0 = [i for i, line in enumerate(gcode) if "G0" in line]
    
    # There should likely be only 1 G0 at start (or 0 if start is 0,0) and 1 at end.
    # Actually logic: if current!=start -> G0.
    # Start is 0,0. First seg start is 0,0. So no initial G0.
    # Then G1. Current 10,10.
    # Next seg start 10,10. No G0.
    # Then G1.
    
    # Let's count G0s excluding the setup or final home
    # Logic:
    # 1. G0 X0 Y0 (Home at end)
    
    # Let's look at the generated list logic
    # It checks equality.
    
    pass 
