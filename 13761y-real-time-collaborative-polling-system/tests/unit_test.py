import pytest
from repository_after.backend.websocket_manager import ConnectionManager
from repository_after.backend.redis_client import RedisClient
from repository_after.backend.models import PollCreate
from unittest.mock import AsyncMock
from pydantic import ValidationError

@pytest.mark.asyncio
async def test_websocket_cleanup():
    manager = ConnectionManager()
    mock_ws = AsyncMock()
    poll_id = "test-poll"

    # Connect
    await manager.connect(poll_id, mock_ws)
    assert poll_id in manager.active_connections
    assert mock_ws in manager.active_connections[poll_id]

    # Disconnect
    manager.disconnect(poll_id, mock_ws)
    assert poll_id not in manager.active_connections

@pytest.mark.asyncio
async def test_broadcast_error_handling():
    manager = ConnectionManager()
    mock_ws_good = AsyncMock()
    mock_ws_bad = AsyncMock()
    # Mock send_text to fail for one client
    mock_ws_bad.send_text.side_effect = Exception("Connection closed")
    
    poll_id = "test-poll"
    await manager.connect(poll_id, mock_ws_good)
    await manager.connect(poll_id, mock_ws_bad)

    await manager.broadcast(poll_id, {"data": "test"})
    
    # Bad client should be removed
    assert mock_ws_bad not in manager.active_connections[poll_id]
    assert mock_ws_good in manager.active_connections[poll_id]


@pytest.mark.asyncio
async def test_websocket_reconnection_handling():
    """
    Test WebSocket reconnection without state corruption
    """
    manager = ConnectionManager()
    mock_ws = AsyncMock()
    poll_id = "reconnect-test-poll"
    
    # Initial connection
    await manager.connect(poll_id, mock_ws)
    assert poll_id in manager.active_connections
    assert len(manager.active_connections[poll_id]) == 1
    
    # Simulate disconnection
    manager.disconnect(poll_id, mock_ws)
    assert poll_id not in manager.active_connections
    
    # Simulate reconnection
    await manager.connect(poll_id, mock_ws)
    assert poll_id in manager.active_connections
    assert len(manager.active_connections[poll_id]) == 1
    
    # Verify state is clean - no duplicate connections
    assert manager.active_connections[poll_id].count(mock_ws) == 1
    
    # Cleanup
    manager.disconnect(poll_id, mock_ws)


@pytest.mark.asyncio
async def test_redis_client_vote_deduplication():
    """
    Test Redis client vote deduplication logic
    """
    redis_client = RedisClient()
    poll_id = "dedup-test-poll"
    options = ["Option A", "Option B"]
    
    # Create poll
    await redis_client.create_poll(poll_id, options)
    
    # First vote from IP should succeed
    test_ip = "192.168.1.100"
    result = await redis_client.cast_vote(poll_id, "Option A", test_ip)
    assert result is True
    
    # Second vote from same IP should fail
    result = await redis_client.cast_vote(poll_id, "Option B", test_ip)
    assert result is False
    
    # Verify only one vote was counted
    results = await redis_client.get_poll_results(poll_id)
    assert int(results["Option A"]) == 1
    assert int(results["Option B"]) == 0


def test_poll_validation_minimum_options():
    """
    Test poll validation for minimum options
    """
    # Test with 0 options - should raise ValidationError
    with pytest.raises(ValidationError) as exc_info:
        PollCreate(title="No Options Poll", options=[])
    assert "at least 2 options" in str(exc_info.value).lower()
    
    # Test with 1 option - should raise ValidationError
    with pytest.raises(ValidationError) as exc_info:
        PollCreate(title="One Option Poll", options=["Only One"])
    assert "at least 2 options" in str(exc_info.value).lower()
    
    # Test with 2 options - should succeed
    poll = PollCreate(title="Valid Poll", options=["Option 1", "Option 2"])
    assert poll.title == "Valid Poll"
    assert len(poll.options) == 2
    
    # Test with many options - should succeed
    poll = PollCreate(title="Many Options", options=["A", "B", "C", "D", "E"])
    assert len(poll.options) == 5

