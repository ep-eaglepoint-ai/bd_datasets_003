import pytest
import asyncio
import sys
import os

REPO_PATH = os.environ.get("TEST_REPO_PATH", "repository_after")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", REPO_PATH))

from bot import Update, Response, create_bot, TelegramBot


@pytest.fixture
def bot():
    return create_bot()


class TestConcurrentStartCommands:
    """Verify two users sending /start get independent responses."""
    
    def test_two_users_get_independent_responses(self, bot: TelegramBot):
        updates = [
            Update(1, chat_id=100, text="/start", user_id=100),
            Update(2, chat_id=200, text="/start", user_id=200),
        ]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        assert len(responses) == 2
        chat_ids = {r.chat_id for r in responses}
        assert chat_ids == {100, 200}, f"Wrong routing: {chat_ids}"
    
    def test_stress_50_concurrent_users(self, bot: TelegramBot):
        updates = [Update(i, chat_id=1000+i, text="/start", user_id=1000+i) for i in range(50)]
        expected = {1000+i for i in range(50)}
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        assert len(responses) == 50
        actual = {r.chat_id for r in responses}
        assert actual == expected, f"Missing: {expected - actual}"


class TestSlowOperationNoBlocking:
    """Verify slow handler doesn't block fast handlers."""
    
    def test_fast_completes_without_waiting_for_slow(self, bot: TelegramBot):
        slow = Update(1, chat_id=100, text="/slow", user_id=100)
        fast = [Update(i, chat_id=200+i, text="/start", user_id=200+i) for i in range(5)]
        updates = [slow] + fast
        
        async def run():
            start = asyncio.get_event_loop().time()
            responses = await bot.process_updates_concurrent(updates)
            elapsed = asyncio.get_event_loop().time() - start
            return responses, elapsed
        
        responses, elapsed = asyncio.run(run())
        
        assert len(responses) == 6
        # Concurrent: ~0.5s. Sequential would be ~3s
        assert elapsed < 1.5, f"Blocking detected: {elapsed:.2f}s"
    
    def test_completion_order_independent(self, bot: TelegramBot):
        order = []
        
        async def track_slow():
            update = Update(1, chat_id=100, text="/slow", user_id=100)
            r = await bot.process_update(update)
            order.append(("slow", r.chat_id))
        
        async def track_fast(i):
            update = Update(i, chat_id=200+i, text="/start", user_id=200+i)
            r = await bot.process_update(update)
            order.append(("fast", r.chat_id))
        
        async def run():
            tasks = [asyncio.create_task(track_slow())]
            tasks.extend(asyncio.create_task(track_fast(i)) for i in range(3))
            await asyncio.gather(*tasks)
        
        asyncio.run(run())
        
        slow_idx = next(i for i, (t, _) in enumerate(order) if t == "slow")
        fast_before = sum(1 for i, (t, _) in enumerate(order) if t == "fast" and i < slow_idx)
        assert fast_before >= 1, f"Fast should complete before slow: {order}"


class TestEchoRoutesCorrectly:
    """Verify echo returns correct content to each user."""
    
    def test_each_user_gets_own_echo(self, bot: TelegramBot):
        updates = [
            Update(1, chat_id=100, text="/echo ALPHA100", user_id=100),
            Update(2, chat_id=200, text="/echo BETA200", user_id=200),
            Update(3, chat_id=300, text="/echo GAMMA300", user_id=300),
        ]
        expected = {100: "ALPHA100", 200: "BETA200", 300: "GAMMA300"}
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        for r in responses:
            assert expected[r.chat_id] in r.text, f"Chat {r.chat_id} got wrong echo: {r.text}"
    
    def test_100_concurrent_echoes_no_mixing(self, bot: TelegramBot):
        updates = [Update(i, chat_id=i, text=f"/echo TOKEN_{i}", user_id=i) for i in range(1, 101)]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        for r in responses:
            expected = f"TOKEN_{r.chat_id}"
            assert expected in r.text, f"Content mixing: chat {r.chat_id} got {r.text}"


class TestErrorIsolation:
    """Verify error in one task doesn't affect others."""
    
    def test_error_doesnt_crash_other_tasks(self, bot: TelegramBot):
        updates = [
            Update(1, chat_id=100, text="/error", user_id=100),
            Update(2, chat_id=200, text="/start", user_id=200),
            Update(3, chat_id=300, text="/echo test", user_id=300),
        ]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        assert len(responses) == 3
        assert {r.chat_id for r in responses} == {100, 200, 300}
    
    def test_error_response_only_to_affected_user(self, bot: TelegramBot):
        updates = [
            Update(1, chat_id=100, text="/error", user_id=100),
            Update(2, chat_id=200, text="/start", user_id=200),
        ]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        error_responses = [r for r in responses if "Error:" in r.text]
        assert len(error_responses) == 1
        assert error_responses[0].chat_id == 100, f"Error went to wrong chat: {error_responses[0].chat_id}"


class TestStateIsolation:
    """Verify per-user state not corrupted under concurrency."""
    
    def test_concurrent_increments_no_lost_updates(self, bot: TelegramBot):
        user_id = 1000
        num = 50
        updates = [Update(i, chat_id=user_id, text="/count", user_id=user_id) for i in range(num)]
        
        async def run():
            await bot.process_updates_concurrent(updates)
            return await bot.state_manager.get_state(user_id)
        
        state = asyncio.run(run())
        
        assert state["message_count"] == num, f"Lost updates: expected {num}, got {state['message_count']}"
    
    def test_different_users_isolated(self, bot: TelegramBot):
        updates_100 = [Update(i, chat_id=100, text="/count", user_id=100) for i in range(10)]
        updates_200 = [Update(100+i, chat_id=200, text="/count", user_id=200) for i in range(20)]
        
        async def run():
            await bot.process_updates_concurrent(updates_100 + updates_200)
            s100 = await bot.state_manager.get_state(100)
            s200 = await bot.state_manager.get_state(200)
            return s100, s200
        
        s100, s200 = asyncio.run(run())
        
        assert s100["message_count"] == 10, f"User 100 wrong: {s100['message_count']}"
        assert s200["message_count"] == 20, f"User 200 wrong: {s200['message_count']}"
    
    def test_100_users_10_messages_each(self, bot: TelegramBot):
        updates = []
        for uid in range(100):
            for msg in range(10):
                updates.append(Update(uid*10+msg, chat_id=uid, text="/count", user_id=uid))
        
        async def run():
            await bot.process_updates_concurrent(updates)
            results = {}
            for uid in range(100):
                s = await bot.state_manager.get_state(uid)
                results[uid] = s["message_count"]
            return results
        
        results = asyncio.run(run())
        
        wrong = {uid: c for uid, c in results.items() if c != 10}
        assert not wrong, f"State corruption: {wrong}"


class TestResponseRoutingIntegrity:
    """Verify responses NEVER go to wrong chat."""
    
    def test_no_cross_routing(self, bot: TelegramBot):
        updates = [Update(i, chat_id=5000+i, text=f"/echo ID_{5000+i}", user_id=5000+i) for i in range(100)]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        for r in responses:
            expected = f"ID_{r.chat_id}"
            assert expected in r.text, f"CROSS-ROUTING: chat {r.chat_id} got {r.text}"
    
    def test_all_responses_logged_correctly(self, bot: TelegramBot):
        updates = [Update(i, chat_id=i+1000, text="/start", user_id=i+1000) for i in range(10)]
        expected = {i+1000 for i in range(10)}
        
        async def run():
            await bot.process_updates_concurrent(updates)
        
        asyncio.run(run())
        
        logged = {r.chat_id for r in bot.sent_responses}
        assert logged == expected


class TestEdgeCases:
    """Edge case handling."""
    
    def test_empty_text(self, bot: TelegramBot):
        update = Update(1, chat_id=100, text="", user_id=100)
        
        async def run():
            return await bot.process_update(update)
        
        r = asyncio.run(run())
        assert r.chat_id == 100
    
    def test_unknown_command(self, bot: TelegramBot):
        updates = [
            Update(1, chat_id=100, text="/unknown", user_id=100),
            Update(2, chat_id=200, text="/fake", user_id=200),
        ]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        assert {r.chat_id for r in responses} == {100, 200}
    
    def test_single_user_rapid_messages(self, bot: TelegramBot):
        uid = 999
        updates = [Update(i, chat_id=uid, text=f"/echo MSG_{i}", user_id=uid) for i in range(50)]
        
        async def run():
            return await bot.process_updates_concurrent(updates)
        
        responses = asyncio.run(run())
        
        assert len(responses) == 50
        assert all(r.chat_id == uid for r in responses)
