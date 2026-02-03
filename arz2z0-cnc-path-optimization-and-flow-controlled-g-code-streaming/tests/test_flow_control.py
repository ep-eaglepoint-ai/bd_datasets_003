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
