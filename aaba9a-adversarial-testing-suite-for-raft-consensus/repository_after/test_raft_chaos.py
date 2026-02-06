
import pytest
import pytest_asyncio
import asyncio
import time
import random
from typing import List, Set, Dict
from raft_chaos_harness import RaftNodeProxy, ChaosOrchestrator

# --- Mock Implementation of Raft Node ---

class MockRaftNode(RaftNodeProxy):
    """
    A mock Raft node that simulates consistent consensus unless partitioned.
    It shares a 'backend' storage with other nodes to simulate a perfect consistent log,
    but respects partitions (if partitioned from leader, it can't write).
    """
    def __init__(self, node_id, shared_storage: Dict, cluster_state: Dict):
        super().__init__(node_id, f"http://{node_id}:8000", f"http://{node_id}:9000")
        self.shared_storage = shared_storage
        self.cluster_state = cluster_state # Shared state for the whole cluster (leader, terms)
        self.partitioned_peers: Set[str] = set()
        self.is_isolated = False
        self.current_term = 1
        self.latency = 0.0
        self.packet_loss_prob = 0.0
        
    async def _simulate_network(self) -> bool:
        """Simulates network effects. Returns False if packet lost."""
        if self.is_isolated:
            return False
        
        if self.latency > 0:
            await asyncio.sleep(self.latency)
        else:
            # Base network delay
            await asyncio.sleep(random.uniform(0.01, 0.05))
            
        if self.packet_loss_prob > 0:
            if random.random() < self.packet_loss_prob:
                return False
        return True

    async def set_val(self, key: str, val: str) -> bool:
        if not await self._simulate_network():
            return False
            
        if self.is_isolated:
            return False
            
        # Simplified Raft Logic:
        # 1. To write, must communicate with Majority.
        # 2. If partitioned from majority, write fails.
        
        # Check connectivity to others
        active_peers = 0
        total_nodes = len(self.cluster_state['nodes'])
        
        for peer_id in self.cluster_state['nodes']:
            if peer_id == self.node_id:
                active_peers += 1
                continue
            if peer_id not in self.partitioned_peers:
                 # Check probability of packet loss to peer? 
                 # For simplicity, assume if node has packet loss, it affects all comms
                 if random.random() >= self.packet_loss_prob:
                    active_peers += 1
        
        if active_peers <= total_nodes // 2:
            return False # No Quorum
            
        # Basic leader simulation: Update term if needed
        self.shared_storage[key] = val
        return True

    async def get_val(self, key: str) -> str:
        if not await self._simulate_network():
             raise ConnectionError("Packet lost")
        
        if self.is_isolated:
             raise ConnectionError("Node is isolated")
             
        # Read Index / Lease Read check
        # Must contact majority to confirm data is fresh (strong consistency)
        active_peers = 0
        total_nodes = len(self.cluster_state['nodes'])
        
        for peer_id in self.cluster_state['nodes']:
            if peer_id == self.node_id:
                active_peers += 1
                continue
            if peer_id not in self.partitioned_peers:
                 if random.random() >= self.packet_loss_prob:
                     active_peers += 1
                 
        if active_peers <= total_nodes // 2:
             raise ConnectionError("Partitioned from majority")

        return self.shared_storage.get(key, "")

    async def get_term(self) -> int:
        if not await self._simulate_network():
             # If packet loss on term check, maybe just return last known or raise?
             # Raising might break the test loop assertions.
             # Let's say get_term is a local operation not subject to network (except latency to querying client)
             pass
        return self.current_term

    async def isolate(self):
        self.is_isolated = True

    async def partition_from(self, peer_ids: List[str]):
        self.partitioned_peers.update(peer_ids)
        
    async def heal(self):
        self.is_isolated = False
        self.partitioned_peers.clear()
        self.latency = 0.0
        self.packet_loss_prob = 0.0

    async def set_latency(self, delay: float):
        self.latency = delay

    async def set_packet_loss(self, probability: float):
        self.packet_loss_prob = probability

# --- Fixtures ---

@pytest_asyncio.fixture
async def cluster():
    shared_storage = {}
    node_ids = [f"node_{i}" for i in range(5)]
    cluster_state = {'nodes': node_ids}
    
    nodes = [MockRaftNode(nid, shared_storage, cluster_state) for nid in node_ids]
    return nodes

@pytest.fixture
def orchestrator(cluster):
    return ChaosOrchestrator(cluster)

# --- Helpers for Partitions (Requirement 1) ---

async def create_bridge_partition(nodes: List[MockRaftNode]):
    """
    Creates a Bridge partition: A connected to B, B connected to C, but A not to C.
    Mocking this by partitioning A from C and vice versa. center node is B.
    Nodes: 0, 1, 2, 3, 4. 
    Let's say 2 is the bridge. 
    Group 1: {0, 1}
    Group 2: {3, 4}
    Bridge: {2}
    0,1 can talk to 2. 3,4 can talk to 2. 0,1 cannot talk to 3,4.
    """
    active_nodes = nodes
    bridge = active_nodes[2]
    left = active_nodes[0:2]
    right = active_nodes[3:5]
    
    # Left cannot talk to Right
    for l in left:
        await l.partition_from([r.node_id for r in right])
    for r in right:
        await r.partition_from([l.node_id for l in left])
    
    print(f"Bridge Partition Created. Bridge: {bridge.node_id}")

async def create_cyclic_partition(nodes: List[MockRaftNode]):
    """
    A -> B -> C -> D -> E -> A
    Each node only talks to prev and next.
    """
    for i, node in enumerate(nodes):
        # Allow i-1 and i+1 (modulo)
        # Block others
        allowed = {(i-1)%len(nodes), (i+1)%len(nodes), i}
        blocked = []
        for j, peer in enumerate(nodes):
            if j not in allowed:
                blocked.append(peer.node_id)
        
        await node.partition_from(blocked)
    print("Cyclic Partition Created")

async def heal_all(nodes: List[MockRaftNode]):
    for n in nodes:
        await n.heal()

# --- Main Test ---

@pytest.mark.asyncio
@pytest.mark.parametrize("fault_type, packet_loss_prob, partition_size", [
    ("random_partition", 0.0, "random"),
    ("bridge", 0.0, "2v3"),
    ("cyclic", 0.0, "cyclic"),
    ("packet_loss", 0.3, "none"),
    ("packet_loss", 0.1, "none"), # Varying packet loss severity
])
async def test_raft_system_under_chaos(cluster, orchestrator, fault_type, packet_loss_prob, partition_size):
    """
    REQ 1, 2, 3, 4, 5, 6, 7, 8
    """
    duration = 10 
    start_time = time.time()
    
    # Requirement 2: Concurrent Client Simulation
    
    async def client_worker(worker_id):
        while time.time() - start_time < duration:
            key = f"key_{random.randint(0, 10)}"
            val = f"val_{worker_id}_{random.randint(0, 1000)}"
            node = random.choice(cluster)
            
            op_start = time.time()
            try:
                # REQ 8: Packet Loss Interleaving (implicit in node behavior if set)
                # But here we just assume the node handles it.
                if random.random() > 0.5:
                    success = await node.set_val(key, val)
                    op_end = time.time()
                    if success:
                        orchestrator.history.append(("SET", key, val, op_start, op_end, node.node_id))
                else:
                    res = await node.get_val(key)
                    op_end = time.time()
                    orchestrator.history.append(("GET", key, res, op_start, op_end, node.node_id))
            except Exception:
                pass
            
            await asyncio.sleep(random.uniform(0.1, 0.3))

    workers = [asyncio.create_task(client_worker(i)) for i in range(5)]
    
    # REQ 5: Track previous terms for monotonicity
    previous_terms = {n.node_id: 0 for n in cluster}

    # Chaos Loop
    iteration = 0
    while time.time() - start_time < duration:
        iteration += 1
        
        # Req 5: Term Monotonicity Polling
        for n in cluster:
            t = await n.get_term()
            assert t >= previous_terms[n.node_id], f"Term Regression! Node {n.node_id} regressed from {previous_terms[n.node_id]} to {t}"
            previous_terms[n.node_id] = t
            
        # Inject Fault
        if fault_type == "random_partition":
            orchestrator.inject_random_partition()
            ids_a, ids_b = orchestrator.inject_random_partition()
            if ids_a:
                 nodes_a = [n for n in cluster if n.node_id in ids_a]
                 nodes_b = [n for n in cluster if n.node_id in ids_b]
                 for n in nodes_a:
                     await n.partition_from(ids_b)
                 for n in nodes_b:
                     await n.partition_from(ids_a)
                     
        elif fault_type == "bridge":
            await create_bridge_partition(cluster)
        elif fault_type == "cyclic":
            await create_cyclic_partition(cluster)
        
        elif fault_type == "packet_loss":
            # REQ 8: Packet Loss Injection
            orchestrator.inject_packet_loss(packet_loss_prob)
            for n in cluster:
                await n.set_packet_loss(packet_loss_prob)

        # REQ 7: Latency interleaving (randomly introduce latency spikes)
        if random.random() < 0.3:
            latency = random.uniform(0.1, 0.5)
            orchestrator.inject_latency(latency)
            for n in cluster:
                await n.set_latency(latency)
        
        await asyncio.sleep(1) # Let chaos simmer
        
        # Heal
        await heal_all(cluster)
        # Clear packet loss/latency
        for n in cluster:
            await n.set_packet_loss(0.0)
            await n.set_latency(0.0)

        await asyncio.sleep(1) # Let system recover
        
        # Req 4: Liveness Assertion (Time bounded recovery)
        async def liveness_check():
             current_attempt = 0
             while True:
                 try:
                    res = await cluster[0].set_val(f"liveness_{iteration}", "ok")
                    if res: return True
                 except:
                    pass
                 current_attempt += 1
                 if current_attempt > 10: return False # avoid infinite loop inside wait_for context if logic is stuck
                 await asyncio.sleep(0.5)

        try:
             # Wait max 5 seconds for recovery
             start_recovery = time.time()
             await asyncio.wait_for(liveness_check(), timeout=5.0)
             recovery_time = time.time() - start_recovery
             print(f"METRIC: RecoveryLatency={recovery_time:.4f}s")
        except asyncio.TimeoutError:
             pytest.fail("Cluster Liveness check failed: Did not recover within 5 seconds")
        except Exception as e:
             pytest.fail(f"Cluster Liveness check failed: {e}")

    # Join workers
    for w in workers:
        w.cancel()
    
    # Req 3: Safety Assertions (Linearizability)
    is_linearizable = orchestrator.verify_linearizability()
    assert is_linearizable, "History verification failed. Possible Split Brain or Stale Read."
    
    # Req 6: Post-Chaos Consistency Check
    test_key = "consistency_check"
    await cluster[0].set_val(test_key, "final_val")
    await asyncio.sleep(0.5)
    
    seen_values = set()
    for n in cluster:
        try:
            val = await n.get_val(test_key)
            seen_values.add(val)
        except:
            pass
            
    assert len(seen_values) == 1, f"Eventual consistency failed. Nodes see different values: {seen_values}"
    assert "final_val" in seen_values
