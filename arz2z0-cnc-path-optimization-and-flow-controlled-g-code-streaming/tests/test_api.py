"""
Integration tests for the FastAPI backend endpoints.

These tests verify that the HTTP API endpoints work correctly,
including the /status endpoint for job status queries (Req 8).
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app, current_job, job_status, job_progress


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestStatusEndpoint:
    """
    Req 8: The streaming loop must be non-blocking so the HTTP server 
    remains responsive to status queries during a print job.
    """
    
    def test_status_endpoint_exists(self, client):
        """Test that /status endpoint exists and returns 200."""
        response = client.get("/status")
        assert response.status_code == 200
    
    def test_status_returns_required_fields(self, client):
        """Test that /status returns all required fields."""
        response = client.get("/status")
        data = response.json()
        
        required_fields = ['status', 'progress', 'total_lines', 'current_line', 'percent_complete']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
    
    def test_status_initial_state(self, client):
        """Test that initial status is Idle with no job."""
        # Reset state
        import backend.main as main_module
        main_module.current_job = []
        main_module.job_status = "Idle"
        main_module.job_progress = 0
        
        response = client.get("/status")
        data = response.json()
        
        assert data['status'] == 'Idle'
        assert data['progress'] == 0
        assert data['total_lines'] == 0
        assert data['percent_complete'] == 0
    
    def test_status_after_optimization(self, client):
        """Test status reflects loaded job after optimization."""
        # First, optimize some segments
        segments = [
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10},
            {"x1": 10, "y1": 10, "x2": 20, "y2": 20}
        ]
        
        opt_response = client.post("/optimize", json=segments)
        assert opt_response.status_code == 200
        
        # Now check status
        status_response = client.get("/status")
        data = status_response.json()
        
        # Should have lines loaded
        assert data['total_lines'] > 0
        assert data['status'] == 'Idle'


class TestOptimizeEndpoint:
    """Test the /optimize endpoint."""
    
    def test_optimize_accepts_segments(self, client):
        """Test that /optimize accepts segment data."""
        segments = [
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10},
            {"x1": 20, "y1": 20, "x2": 30, "y2": 30}
        ]
        
        response = client.post("/optimize", json=segments)
        assert response.status_code == 200
    
    def test_optimize_returns_gcode(self, client):
        """Test that /optimize returns G-code."""
        segments = [
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10}
        ]
        
        response = client.post("/optimize", json=segments)
        data = response.json()
        
        assert 'gcode' in data
        assert 'count' in data
        assert isinstance(data['gcode'], list)
        assert len(data['gcode']) > 0
    
    def test_optimize_gcode_contains_required_commands(self, client):
        """Test that generated G-code contains required setup commands."""
        segments = [
            {"x1": 10, "y1": 10, "x2": 20, "y2": 20}
        ]
        
        response = client.post("/optimize", json=segments)
        gcode = response.json()['gcode']
        
        # Must have setup commands
        assert "G21" in gcode, "G-code must include G21 (metric units)"
        assert "G90" in gcode, "G-code must include G90 (absolute positioning)"
        
        # Must have at least one G1 (cut) command
        has_g1 = any(line.startswith("G1") for line in gcode)
        assert has_g1, "G-code must include G1 (cut) commands"
    
    def test_optimize_reorders_segments(self, client):
        """
        Req 1: Test that optimizer reorders segments (not just keeps input order).
        """
        # Input segments in suboptimal order
        segments = [
            {"x1": 100, "y1": 100, "x2": 110, "y2": 110},  # Far from origin
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10},        # Near origin
            {"x1": 10, "y1": 10, "x2": 20, "y2": 20}       # Connected to second
        ]
        
        response = client.post("/optimize", json=segments)
        gcode = response.json()['gcode']
        
        # Find the order of cuts in G-code
        # First G1 should be to (10,10) - the segment closest to origin
        g1_lines = [line for line in gcode if line.startswith("G1")]
        
        # First cut should be to (10,10), not (110,110)
        first_cut = g1_lines[0]
        assert "X10.000 Y10.000" in first_cut or "X10.0 Y10.0" in first_cut, \
            f"First cut should be nearest to origin, got: {first_cut}"
    
    def test_optimize_empty_segments(self, client):
        """Test that /optimize handles empty segment list."""
        response = client.post("/optimize", json=[])
        assert response.status_code == 200
        
        data = response.json()
        # Should still have setup commands at minimum
        assert 'gcode' in data


class TestSegmentConversion:
    """
    Req 7: System must accept raw line segment coordinates (x1, y1, x2, y2) 
    and convert them to G0 X.. Y.. and G1 X.. Y..
    """
    
    def test_segment_to_gcode_conversion(self, client):
        """Test that segments are converted to proper G0/G1 commands."""
        segments = [
            {"x1": 15.5, "y1": 25.5, "x2": 35.5, "y2": 45.5}
        ]
        
        response = client.post("/optimize", json=segments)
        gcode = response.json()['gcode']
        
        # Should have G0 travel to segment start
        has_travel = any("G0" in line and "15.5" in line for line in gcode)
        assert has_travel, "Should have G0 travel to segment start"
        
        # Should have G1 cut to segment end
        has_cut = any("G1" in line and "35.5" in line for line in gcode)
        assert has_cut, "Should have G1 cut to segment end"
    
    def test_multiple_segments_conversion(self, client):
        """Test conversion of multiple segments."""
        segments = [
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10},
            {"x1": 10, "y1": 10, "x2": 20, "y2": 20},
            {"x1": 30, "y1": 30, "x2": 40, "y2": 40}
        ]
        
        response = client.post("/optimize", json=segments)
        gcode = response.json()['gcode']
        
        # Count G1 commands (should have at least 3, one per segment)
        g1_count = sum(1 for line in gcode if line.startswith("G1"))
        assert g1_count >= 3, f"Expected at least 3 G1 commands, got {g1_count}"


class TestWebSocketIntegration:
    """Test WebSocket endpoint availability and drip-feed protocol."""
    
    def test_websocket_endpoint_exists(self, client):
        """Test that WebSocket endpoint exists and accepts connections."""
        with client.websocket_connect("/ws") as websocket:
            assert websocket is not None
    
    def test_websocket_start_without_job_returns_error(self, client):
        """Test that START without a loaded job returns an error."""
        # Reset job state
        import backend.main as main_module
        main_module.current_job = []
        
        with client.websocket_connect("/ws") as websocket:
            websocket.send_text("START")
            response = websocket.receive_text()
            assert "ERROR" in response, "Should return error when no job loaded"
    
    def test_websocket_drip_feed_sends_gcode_lines(self, client):
        """
        Req 3: Test that WebSocket drip-feeds G-code one line at a time.
        Sending the whole file in one message is a failure.
        """
        # First load a job
        segments = [
            {"x1": 0, "y1": 0, "x2": 10, "y2": 10},
        ]
        response = client.post("/optimize", json=segments)
        assert response.status_code == 200, f"Optimize failed: {response.text}"
        
        with client.websocket_connect("/ws") as websocket:
            websocket.send_text("START")
            
            # Collect messages
            messages = []
            gcode_messages = []
            ack_messages = []
            
            # Receive all messages until job complete or timeout
            import time
            start_time = time.time()
            max_time = 10  # 10 second timeout
            
            while time.time() - start_time < max_time:
                try:
                    msg = websocket.receive_text()
                    messages.append(msg)
                    
                    if msg.startswith("GCODE:"):
                        gcode_messages.append(msg)
                    elif msg.startswith("ACK:"):
                        ack_messages.append(msg)
                    elif msg == "JOB_COMPLETE":
                        break
                except Exception as e:
                    # No more messages
                    break
            
            # Debug: print all messages received
            print(f"All messages received: {messages}")
            
            # Should have received individual GCODE messages (not all at once)
            assert len(gcode_messages) > 0, f"Should receive GCODE messages. All messages: {messages}"
            
            # Each GCODE should be followed by an ACK (drip-feed protocol)
            assert len(ack_messages) == len(gcode_messages), \
                "Each GCODE should have a corresponding ACK"
    
    def test_websocket_pause_resume(self, client):
        """Test that PAUSE and RESUME commands work."""
        with client.websocket_connect("/ws") as websocket:
            # Send PAUSE
            websocket.send_text("PAUSE")
            response = websocket.receive_text()
            assert "STATUS: Paused" in response
            
            # Send RESUME
            websocket.send_text("RESUME")
            response = websocket.receive_text()
            assert "STATUS: Printing" in response
    
    def test_websocket_status_messages(self, client):
        """
        Req 10: Test that WebSocket sends status updates (Printing, Idle, Paused).
        """
        # Load a job first
        segments = [{"x1": 0, "y1": 0, "x2": 10, "y2": 10}]
        client.post("/optimize", json=segments)
        
        with client.websocket_connect("/ws") as websocket:
            websocket.send_text("START")
            
            # First message should be status
            first_msg = websocket.receive_text()
            assert "STATUS: Printing" in first_msg, \
                f"First message should be status, got: {first_msg}"
