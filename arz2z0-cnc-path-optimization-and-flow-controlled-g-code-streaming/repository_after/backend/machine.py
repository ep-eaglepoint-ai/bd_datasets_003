import asyncio
import logging

class Machine:
    def __init__(self):
        self.logger = logging.getLogger("Machine")
    
    async def process_command(self, command: str) -> str:
        """
        Simulates receiving a command, executing it (latency), 
        and returning an acknowledgment.
        """
        # Parse command to determine duration
        # Very basic heuristic:
        # G0 (Rapid) = Fast
        # G1 (Cut) = Slower, depends on distance?
        # For simulation, fixed delays are fine but let's make it slightly dynamic
        
        delay = 0.01  # overhead
        
        if "G0" in command or "G1" in command:
            # Simulate travel time
            # For 100% realism we'd calculate distance, but prompt just says "simulating latency".
            # "waits for a virtual 'ok' acknowledgment (simulating the machine finishing the move)"
            delay = 0.1 
            if "G0" in command:
                delay = 0.05
        
        await asyncio.sleep(delay)
        return "ok"
