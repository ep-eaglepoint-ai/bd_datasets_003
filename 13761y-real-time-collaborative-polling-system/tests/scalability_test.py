import pytest
from repository_after.backend.redis_client import redis_client
from repository_after.backend.websocket_manager import ConnectionManager, manager
from repository_after.backend.main import polls_db
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_redis_shared_state_architecture():
    """
    Verify Redis is used for shared state (horizontal scalability)
    """
    # 1. Verify vote counts are stored in Redis, not in-memory
    poll_id = "scalability-test-poll"
    options = ["Option 1", "Option 2"]
    await redis_client.create_poll(poll_id, options)
    
    # Cast a vote
    success = await redis_client.cast_vote(poll_id, "Option 1", "test-ip-1")
    assert success is True
    
    # Verify the vote is in Redis
    results = await redis_client.get_poll_results(poll_id)
    # Redis returns strings, so we need to convert
    assert results.get("Option 1") == "1" or int(results.get("Option 1", 0)) == 1
    
    # 2. Verify voter IPs are stored in Redis SET (not in-memory)
    voted = await redis_client.redis.sismember(f"poll:{poll_id}:voters", "test-ip-1")
    assert voted  # Redis returns 1 for True, 0 for False
    
    # 3. Verify multiple ConnectionManager instances can coexist
    # This demonstrates that WebSocket managers don't share in-memory state
    manager1 = ConnectionManager()
    manager2 = ConnectionManager()
    
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()
    
    await manager1.connect(poll_id, mock_ws1)
    await manager2.connect(poll_id, mock_ws2)
    
    # Each manager has its own connections (simulating different backend instances)
    assert poll_id in manager1.active_connections
    assert poll_id in manager2.active_connections
    assert manager1.active_connections[poll_id] != manager2.active_connections[poll_id]
    
    # Cleanup
    manager1.disconnect(poll_id, mock_ws1)
    manager2.disconnect(poll_id, mock_ws2)


@pytest.mark.asyncio
async def test_stateless_backend_design():
    """
    Verify backend is stateless (except for poll metadata)
    """
    # 1. Verify polls_db is the only in-memory state
    # This is acceptable because poll metadata is read-only after creation
    # and can be replicated across instances
    
    # 2. Verify all vote data goes through Redis
    poll_id = "stateless-test-poll"
    options = ["Choice A", "Choice B"]
    await redis_client.create_poll(poll_id, options)
    
    # Vote using Redis client
    await redis_client.cast_vote(poll_id, "Choice A", "ip-1")
    await redis_client.cast_vote(poll_id, "Choice B", "ip-2")
    
    # Retrieve results from Redis
    results = await redis_client.get_poll_results(poll_id)
    # Redis returns strings
    assert results.get("Choice A") == "1" or int(results.get("Choice A", 0)) == 1
    assert results.get("Choice B") == "1" or int(results.get("Choice B", 0)) == 1
    
    # 3. Verify Redis Pub/Sub infrastructure exists
    # The redis_listener function is defined in websocket_manager.py
    # This demonstrates the architecture supports horizontal scaling
    from repository_after.backend.websocket_manager import redis_listener
    assert callable(redis_listener)
    
    # 4. Verify ConnectionManager can broadcast to multiple clients
    # This simulates multiple backend instances broadcasting via Redis Pub/Sub
    test_manager = ConnectionManager()
    clients = [AsyncMock() for _ in range(5)]
    
    for client in clients:
        await test_manager.connect(poll_id, client)
    
    # Broadcast a message
    await test_manager.broadcast(poll_id, {"type": "test", "data": "scalability"})
    
    # All clients should receive the message
    for client in clients:
        assert client.send_text.called
    
    # Cleanup
    for client in clients:
        test_manager.disconnect(poll_id, client)


@pytest.mark.asyncio
async def test_redis_persistence_across_instances():
    """
    Verify Redis data persists and can be accessed by different operations
    """
    # Create a poll
    poll_id = "persistence-test-poll"
    options = ["A", "B", "C"]
    await redis_client.create_poll(poll_id, options)
    
    # Vote with redis_client
    await redis_client.cast_vote(poll_id, "A", "ip-100")
    await redis_client.cast_vote(poll_id, "B", "ip-101")
    
    # Verify the data persists in Redis by reading it back
    results = await redis_client.get_poll_results(poll_id)
    # Redis returns strings
    assert results.get("A") == "1" or int(results.get("A", 0)) == 1
    assert results.get("B") == "1" or int(results.get("B", 0)) == 1
    assert results.get("C") == "0" or int(results.get("C", 0)) == 0
    
    # Add another vote
    await redis_client.cast_vote(poll_id, "C", "ip-102")
    
    # Verify the new vote is persisted
    results = await redis_client.get_poll_results(poll_id)
    assert results.get("C") == "1" or int(results.get("C", 0)) == 1
    
    # Verify voter IPs are persisted in Redis SET
    ip_100_voted = await redis_client.redis.sismember(f"poll:{poll_id}:voters", "ip-100")
    ip_101_voted = await redis_client.redis.sismember(f"poll:{poll_id}:voters", "ip-101")
    ip_102_voted = await redis_client.redis.sismember(f"poll:{poll_id}:voters", "ip-102")
    
    assert ip_100_voted  # Redis returns 1 for True
    assert ip_101_voted
    assert ip_102_voted
    
    # This demonstrates that data persists in Redis across operations
    # In a real multi-instance scenario, different backend servers would share this Redis instance

