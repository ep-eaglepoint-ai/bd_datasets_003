import asyncio
import pytest #type: ignore
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from main import WeatherGridCache  # type: ignore


class TestWeatherGridCache:
    
    @pytest.fixture
    def cache(self):
        return WeatherGridCache(ttl_seconds=60)
    
    @pytest.mark.asyncio
    async def test_grid_snapping_rounds_to_one_decimal(self, cache):
        assert cache._snap_to_grid(10.12, 20.12) == (10.1, 20.1)
        assert cache._snap_to_grid(10.19, 20.19) == (10.1, 20.1)
        assert cache._snap_to_grid(10.04, 10.04) == (10.0, 10.0)
        assert cache._snap_to_grid(10.01, 10.01) == (10.0, 10.0)
        assert cache._snap_to_grid(35.567, -120.489) == (35.5, -120.5)
    
    @pytest.mark.asyncio
    async def test_nearby_coordinates_share_cache_key(self, cache):
        cache.reset_fetch_count()
        temp1 = await cache.get_temperature(10.12, 20.12)
        temp2 = await cache.get_temperature(10.19, 20.19)
        assert temp1 == temp2
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_request_coalescing_single_fetch(self, cache):
        cache.reset_fetch_count()
        tasks = [asyncio.create_task(cache.get_temperature(35.5, -120.5)) for _ in range(100)]
        results = await asyncio.gather(*tasks)
        assert len(set(results)) == 1, "All requests should return the same temperature"
        assert cache.get_fetch_count() == 1, f"Expected 1 fetch, got {cache.get_fetch_count()}"
    
    @pytest.mark.asyncio
    async def test_request_coalescing_with_varying_coordinates_in_bucket(self, cache):
        cache.reset_fetch_count()
        coords = [
            (10.12, 20.12),
            (10.19, 20.19),
            (10.15, 20.15),
            (10.11, 20.11),
            (10.14, 20.14),
        ]
        tasks = [asyncio.create_task(cache.get_temperature(lat, lon)) for lat, lon in coords * 10]
        results = await asyncio.gather(*tasks)
        assert len(set(results)) == 1
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_asyncio_usage(self, cache):
        result = cache.get_temperature(10.0, 10.0)
        assert asyncio.iscoroutine(result), "get_temperature must return a coroutine"
        await result
    
    @pytest.mark.asyncio
    async def test_separate_cache_and_inflight_storage(self, cache):
        assert hasattr(cache, '_cache'), "Cache must have _cache attribute for cached values"
        assert hasattr(cache, '_inflight'), "Cache must have _inflight attribute for pending requests"
        assert isinstance(cache._cache, dict), "_cache must be a dictionary"
        assert isinstance(cache._inflight, dict), "_inflight must be a dictionary"
        
        cache.reset_fetch_count()
        task1 = asyncio.create_task(cache.get_temperature(50.0, 50.0))
        await asyncio.sleep(0.01)
        grid_key = cache._snap_to_grid(50.0, 50.0)
        assert grid_key in cache._inflight, "In-flight request should be tracked"
        assert grid_key not in cache._cache, "Result should not be in cache yet"
        await task1
        assert grid_key in cache._cache, "Result should be in cache after completion"
        assert grid_key not in cache._inflight, "In-flight entry should be cleaned up"
    
    @pytest.mark.asyncio
    async def test_upstream_fetch_simulation_with_latency(self, cache):
        cache.reset_fetch_count()
        start_time = time.time()
        await cache.get_temperature(99.0, 99.0)
        elapsed = time.time() - start_time
        assert elapsed >= 0.2, f"Upstream fetch should simulate 200ms latency, took {elapsed:.3f}s"
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_all_concurrent_waiters_receive_result(self, cache):
        cache.reset_fetch_count()
        num_waiters = 50
        tasks = [asyncio.create_task(cache.get_temperature(42.0, 42.0)) for _ in range(num_waiters)]
        results = await asyncio.gather(*tasks)
        assert len(results) == num_waiters, "All waiters should receive a result"
        assert len(set(results)) == 1, "All waiters should receive the same temperature"
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_exception_propagation_to_all_waiters(self, cache):
        original_fetch = cache._fetch_from_upstream
        
        async def failing_fetch(lat, lon):
            cache._fetch_counter += 1
            await asyncio.sleep(0.1)
            raise ValueError("Simulated upstream API failure")
        
        cache._fetch_from_upstream = failing_fetch
        cache.reset_fetch_count()
        tasks = [asyncio.create_task(cache.get_temperature(88.0, 88.0)) for _ in range(10)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        assert len(results) == 10
        assert all(isinstance(r, ValueError) for r in results), "All waiters should receive the exception"
        assert all(str(r) == "Simulated upstream API failure" for r in results)
        assert cache.get_fetch_count() == 1
        cache._fetch_from_upstream = original_fetch
    
    @pytest.mark.asyncio
    async def test_grid_test_shared_bucket_verification(self, cache):
        cache.reset_fetch_count()
        temp1 = await cache.get_temperature(10.01, 10.01)
        temp2 = await cache.get_temperature(10.04, 10.04)
        assert temp1 == temp2, "Coordinates in same bucket should return same temperature"
        fetch_count = cache.get_fetch_count()
        assert fetch_count == 1, f"Expected 1 fetch for shared bucket, got {fetch_count}"
    
    @pytest.mark.asyncio
    async def test_independence_different_buckets(self, cache):
        cache.reset_fetch_count()
        task_a = asyncio.create_task(cache.get_temperature(10.0, 10.0))
        task_b = asyncio.create_task(cache.get_temperature(20.0, 20.0))
        results = await asyncio.gather(task_a, task_b)
        assert results[0] != results[1], "Different buckets should return different temperatures"
        fetch_count = cache.get_fetch_count()
        assert fetch_count == 2, f"Expected 2 fetches for different buckets, got {fetch_count}"
    
    @pytest.mark.asyncio
    async def test_independence_multiple_different_buckets(self, cache):
        cache.reset_fetch_count()
        coords = [
            (10.0, 10.0),
            (20.0, 20.0),
            (30.0, 30.0),
            (40.0, 40.0),
            (50.0, 50.0),
        ]
        tasks = [asyncio.create_task(cache.get_temperature(lat, lon)) for lat, lon in coords]
        results = await asyncio.gather(*tasks)
        assert len(set(results)) == 5, "All different buckets should return different temperatures"
        assert cache.get_fetch_count() == 5
    
    @pytest.mark.asyncio
    async def test_ttl_expiration(self, cache):
        short_ttl_cache = WeatherGridCache(ttl_seconds=1)
        short_ttl_cache.reset_fetch_count()
        temp1 = await short_ttl_cache.get_temperature(15.0, 15.0)
        assert short_ttl_cache.get_fetch_count() == 1
        temp2 = await short_ttl_cache.get_temperature(15.0, 15.0)
        assert short_ttl_cache.get_fetch_count() == 1
        assert temp1 == temp2
        await asyncio.sleep(1.1)
        temp3 = await short_ttl_cache.get_temperature(15.0, 15.0)
        assert short_ttl_cache.get_fetch_count() == 2
        assert temp3 == temp1
    
    @pytest.mark.asyncio
    async def test_cache_hit_within_ttl(self, cache):
        cache.reset_fetch_count()
        temp1 = await cache.get_temperature(25.5, 25.5)
        assert cache.get_fetch_count() == 1
        for _ in range(10):
            temp = await cache.get_temperature(25.5, 25.5)
            assert temp == temp1
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_negative_coordinates(self, cache):
        cache.reset_fetch_count()
        temp = await cache.get_temperature(-35.5, -120.5)
        assert temp is not None
        assert cache.get_fetch_count() == 1
        assert cache._snap_to_grid(-35.567, -120.489) == (-35.6, -120.5)
    
    @pytest.mark.asyncio
    async def test_zero_coordinates(self, cache):
        cache.reset_fetch_count()
        temp = await cache.get_temperature(0.0, 0.0)
        assert temp is not None
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_concurrent_requests_different_and_same_buckets(self, cache):
        cache.reset_fetch_count()
        tasks_a = [asyncio.create_task(cache.get_temperature(10.01 + i*0.001, 10.01)) for i in range(50)]
        tasks_b = [asyncio.create_task(cache.get_temperature(20.01 + i*0.001, 20.01)) for i in range(50)]
        results = await asyncio.gather(*tasks_a, *tasks_b)
        assert len(set(results[:50])) == 1
        assert len(set(results[50:])) == 1
        assert results[0] != results[50]
        assert cache.get_fetch_count() == 2
    
    @pytest.mark.asyncio
    async def test_cache_clear(self, cache):
        cache.reset_fetch_count()
        await cache.get_temperature(30.0, 30.0)
        assert cache.get_fetch_count() == 1
        cache.clear_cache()
        assert len(cache._cache) == 0
        assert len(cache._inflight) == 0
        assert cache.get_fetch_count() == 0
        await cache.get_temperature(30.0, 30.0)
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_high_concurrency_stress(self, cache):
        cache.reset_fetch_count()
        tasks = [asyncio.create_task(cache.get_temperature(40.0, 40.0)) for _ in range(1000)]
        results = await asyncio.gather(*tasks)
        assert len(results) == 1000
        assert len(set(results)) == 1
        assert cache.get_fetch_count() == 1
    
    @pytest.mark.asyncio
    async def test_many_different_buckets(self, cache):
        cache.reset_fetch_count()
        tasks = []
        for i in range(100):
            lat = i * 1.0
            lon = i * 1.0
            tasks.append(asyncio.create_task(cache.get_temperature(lat, lon)))
        results = await asyncio.gather(*tasks)
        assert len(set(results)) == 100
        assert cache.get_fetch_count() == 100



if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
