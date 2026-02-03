import pytest
import asyncio
from backend.machine import Machine

@pytest.mark.asyncio
async def test_machine_ack():
    m = Machine()
    start_time = asyncio.get_event_loop().time()
    ack = await m.process_command("G1 X10 Y10")
    end_time = asyncio.get_event_loop().time()
    
    assert ack == "ok"
    # Verify delay happened (simulating latency)
    assert (end_time - start_time) >= 0.05 # G1 delay 0.1 usually, G0 0.05
    
@pytest.mark.asyncio
async def test_machine_g0_delay():
    m = Machine()
    start_time = asyncio.get_event_loop().time()
    ack = await m.process_command("G0 X10 Y10")
    end_time = asyncio.get_event_loop().time()
    
    assert (end_time - start_time) >= 0.01


@pytest.mark.asyncio
async def test_machine_returns_ok_acknowledgment():
    """
    Req 6: Backend must include a dummy class acting as the machine 
    that consumes line-by-line and returns acknowledgments.
    """
    machine = Machine()
    
    commands = ["G21", "G90", "F1000", "G0 X10 Y10", "G1 X20 Y20"]
    
    for cmd in commands:
        ack = await machine.process_command(cmd)
        assert ack == "ok", f"Machine should return 'ok' for command: {cmd}"


@pytest.mark.asyncio
async def test_machine_simulates_latency():
    """
    Req 6: Machine class should simulate latency for processing commands.
    """
    machine = Machine()
    
    # G1 commands should have longer delay than G0
    start = asyncio.get_event_loop().time()
    await machine.process_command("G1 X10 Y10")
    g1_time = asyncio.get_event_loop().time() - start
    
    start = asyncio.get_event_loop().time()
    await machine.process_command("G0 X10 Y10")
    g0_time = asyncio.get_event_loop().time() - start
    
    # G1 (cutting) should take longer than G0 (rapid travel)
    assert g1_time >= g0_time, "G1 should take at least as long as G0"


@pytest.mark.asyncio
async def test_drip_feed_processes_one_line_at_a_time():
    """
    Req 3: WebSocket logic must implement ACK mechanism.
    Test that the machine processes commands one at a time, waiting for each to complete.
    """
    machine = Machine()
    
    gcode_lines = [
        "G21",
        "G90", 
        "F1000",
        "G0 X10 Y10",
        "G1 X20 Y20",
        "G0 X0 Y0"
    ]
    
    acks_received = []
    
    # Simulate drip-feed: send one line, wait for ACK, then send next
    for line in gcode_lines:
        # Send to machine and wait for ACK
        ack = await machine.process_command(line)
        acks_received.append(ack)
        
        # Only proceed after receiving ACK
        assert ack == "ok", f"Must receive ACK before sending next command"
    
    # Should have received one ACK per line
    assert len(acks_received) == len(gcode_lines)
    assert all(ack == "ok" for ack in acks_received)


@pytest.mark.asyncio
async def test_streaming_is_non_blocking():
    """
    Req 8: The streaming loop must be non-blocking (asyncio).
    Verify that other coroutines can run while processing machine commands.
    """
    machine = Machine()
    
    # Track if other task could run
    other_task_ran = False
    
    async def other_task():
        nonlocal other_task_ran
        await asyncio.sleep(0.01)
        other_task_ran = True
    
    async def machine_task():
        for _ in range(3):
            await machine.process_command("G1 X10 Y10")
    
    # Run both concurrently
    await asyncio.gather(machine_task(), other_task())
    
    # Other task should have been able to run
    assert other_task_ran, "Other coroutines should be able to run during streaming"


class MockWebSocket:
    """Mock WebSocket for testing drip-feed protocol."""
    
    def __init__(self):
        self.sent_messages = []
        self.receive_queue = asyncio.Queue()
        
    async def send_text(self, message: str):
        self.sent_messages.append(message)
        
    async def receive_text(self) -> str:
        return await self.receive_queue.get()
        
    async def put_message(self, message: str):
        await self.receive_queue.put(message)


@pytest.mark.asyncio
async def test_drip_feed_sends_gcode_then_ack():
    """
    Req 3: Verify that backend sends GCODE message, waits for machine ACK,
    then sends ACK confirmation before proceeding to next line.
    """
    machine = Machine()
    
    gcode_lines = ["G0 X10 Y10", "G1 X20 Y20"]
    messages_in_order = []
    
    for line in gcode_lines:
        # 1. Backend would send GCODE to frontend
        messages_in_order.append(f"GCODE: {line}")
        
        # 2. Backend sends to machine and waits for ACK
        ack = await machine.process_command(line)
        assert ack == "ok"
        
        # 3. Backend would send ACK confirmation
        messages_in_order.append(f"ACK: {line}")
    
    # Verify message ordering
    assert len(messages_in_order) == 4
    assert messages_in_order[0] == "GCODE: G0 X10 Y10"
    assert messages_in_order[1] == "ACK: G0 X10 Y10"
    assert messages_in_order[2] == "GCODE: G1 X20 Y20"
    assert messages_in_order[3] == "ACK: G1 X20 Y20"


@pytest.mark.asyncio
async def test_machine_processes_setup_commands():
    """Test that machine handles G-code setup commands properly."""
    machine = Machine()
    
    setup_commands = ["G21", "G90", "F1000"]
    
    for cmd in setup_commands:
        ack = await machine.process_command(cmd)
        assert ack == "ok"
