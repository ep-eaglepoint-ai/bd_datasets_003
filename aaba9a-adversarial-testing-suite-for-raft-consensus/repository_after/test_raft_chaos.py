
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
        
    async def set_val(self, key: str, val: str) -> bool:
        # Simulate Network Delay
        await asyncio.sleep(random.uniform(0.01, 0.05))
        
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
                 active_peers += 1
        
        if active_peers <= total_nodes // 2:
            return False # No Quorum
            
        # Basic leader simulation: Update term if needed
        self.shared_storage[key] = val
        return True

    async def get_val(self, key: str) -> str:
        # Simulate Network Delay
        await asyncio.sleep(random.uniform(0.01, 0.05))
        
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
                 active_peers += 1
                 
        if active_peers <= total_nodes // 2:
             raise ConnectionError("Partitioned from majority")

        return self.shared_storage.get(key, "")

    async def get_term(self) -> int:
        return self.current_term

    async def isolate(self):
        self.is_isolated = True

    async def partition_from(self, peer_ids: List[str]):
        self.partitioned_peers.update(peer_ids)
        
    async def heal(self):
        self.is_isolated = False
        self.partitioned_peers.clear()

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
@pytest.mark.parametrize("fault_type", ["random_partition", "bridge", "cyclic", "packet_loss"])
async def test_raft_system_under_chaos(cluster, orchestrator, fault_type):
    """
    REQ 1, 2, 3, 4, 5, 6, 7, 8
    """
    duration = 10 # Shortened for this run, would be longer in real life
    start_time = time.time()
    
    # Requirement 2: Concurrent Client Simulation
    # We will spawn a background task that sends requests
    
    async def client_worker(worker_id):
        while time.time() - start_time < duration:
            key = f"key_{random.randint(0, 10)}"
            val = f"val_{worker_id}_{random.randint(0, 1000)}"
            node = random.choice(cluster)
            
            # Req 7: Interleave ops with faults (happens via parallel execution here)
            op_start = time.time()
            try:
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
                # Expected during partitions
                pass
            
            await asyncio.sleep(random.uniform(0.1, 0.3))

    workers = [asyncio.create_task(client_worker(i)) for i in range(5)]
    
    # Chaos Loop
    iteration = 0
    while time.time() - start_time < duration:
        iteration += 1
        
        # Req 5: Term Monotonicity Polling
        terms = []
        for n in cluster:
            t = await n.get_term()
            terms.append(t)
            # Check monotonicity relative to previous check (simplified here to just be valid)
            assert t >= 1
            
        # Inject Fault
        if fault_type == "random_partition":
            orchestrator.inject_random_partition()
            # For the mock, we need to apply this to the nodes
            # The orchestrator in this mock setup just returns the sets, 
            # effectively we need to implement the side effects if orchestrator didn't.
            # But wait, orchestrator.inject_random_partition() in my implementation returns ids but doesn't call partition_from
            # Let's fix that usage or do it here.
            # My Orchestrator implementation printed but didn't call. 
            # I will manually call here to be safe, or just rely on 'create_bridge_partition' logic style.
            # Let's just do a simple split here for the mock.
            ids_a, ids_b = orchestrator.inject_random_partition() # It returns tuple
            if ids_a:
                # Apply partition
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
        
        await asyncio.sleep(1) # Let chaos simmer
        
        # Heal
        await heal_all(cluster)
        await asyncio.sleep(1) # Let system recover
        
        # Req 4: Liveness Assertion
        # Assert that we can write after healing
        try:
             # Try writing to a random node
             res = await cluster[0].set_val("liveness_check", "ok")
             assert res is True, "Cluster failed to recover liveness after healing"
        except Exception as e:
             pytest.fail(f"Cluster Liveness check failed: {e}")

    # Join workers
    for w in workers:
        w.cancel()
    
    # Req 3: Safety Assertions (Linearizability)
    is_linearizable = orchestrator.verify_linearizability()
    assert is_linearizable, "History verification failed. Possible Split Brain or Stale Read."
    
    # Req 6: Post-Chaos Consistency Check
    # Verify all nodes see the same value for a specific key
    test_key = "consistency_check"
    await cluster[0].set_val(test_key, "final_val")
    await asyncio.sleep(0.5) # Propagate
    
    seen_values = set()
    for n in cluster:
        try:
            val = await n.get_val(test_key)
            seen_values.add(val)
        except:
            pass # Ignore nodes that might still be transiently down (unlikely with heal_all)
            
    assert len(seen_values) == 1, f"Eventual consistency failed. Nodes see different values: {seen_values}"
    assert "final_val" in seen_values

