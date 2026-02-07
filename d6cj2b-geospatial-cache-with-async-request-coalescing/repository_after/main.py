import asyncio
import math
import time
from typing import Tuple, Dict, Optional


class WeatherGridCache:
    
    def __init__(self, ttl_seconds: int = 60):
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[Tuple[float, float], Tuple[float, float]] = {}
        self._inflight: Dict[Tuple[float, float], asyncio.Future] = {}
        self._fetch_counter = 0
        self._lock = asyncio.Lock()
    
    def _snap_to_grid(self, lat: float, lon: float) -> Tuple[float, float]:
        snapped_lat = math.floor(lat * 10) / 10
        snapped_lon = math.floor(lon * 10) / 10
        return (snapped_lat, snapped_lon)
    
    def _is_cache_valid(self, timestamp: float) -> bool:
        age = time.time() - timestamp
        return age < self.ttl_seconds
    
    async def _fetch_from_upstream(self, lat: float, lon: float) -> float:
        await asyncio.sleep(0.2)
        self._fetch_counter += 1
        temperature = 20.0 + (lat + lon) / 10
        return temperature
    
    async def get_temperature(self, lat: float, lon: float) -> float:
        grid_key = self._snap_to_grid(lat, lon)
        
        if grid_key in self._cache:
            temperature, timestamp = self._cache[grid_key]
            if self._is_cache_valid(timestamp):
                return temperature
        
        async with self._lock:
            if grid_key in self._cache:
                temperature, timestamp = self._cache[grid_key]
                if self._is_cache_valid(timestamp):
                    return temperature
            
            if grid_key in self._inflight:
                future = self._inflight[grid_key]
            else:
                future = asyncio.Future()
                self._inflight[grid_key] = future
                asyncio.create_task(self._fetch_and_populate(grid_key, lat, lon, future))
        
        temperature = await future
        return temperature
    
    async def _fetch_and_populate(
        self,
        grid_key: Tuple[float, float],
        lat: float,
        lon: float,
        future: asyncio.Future
    ) -> None:
        try:
            temperature = await self._fetch_from_upstream(lat, lon)
            self._cache[grid_key] = (temperature, time.time())
            future.set_result(temperature)
        except Exception as e:
            future.set_exception(e)
        finally:
            async with self._lock:
                if grid_key in self._inflight and self._inflight[grid_key] is future:
                    del self._inflight[grid_key]
    
    def get_fetch_count(self) -> int:
        return self._fetch_counter
    
    def reset_fetch_count(self) -> None:
        self._fetch_counter = 0
    
    def clear_cache(self) -> None:
        self._cache.clear()
        self._inflight.clear()
        self._fetch_counter = 0


async def main():
    cache = WeatherGridCache(ttl_seconds=60)
    
    print("=== Weather Grid Cache Demo ===\n")
    
    print("Example 1: Grid Snapping")
    temp1 = await cache.get_temperature(10.12, 20.12)
    print(f"Temperature at (10.12, 20.12): {temp1:.2f}°C")
    
    temp2 = await cache.get_temperature(10.19, 20.19)
    print(f"Temperature at (10.19, 20.19): {temp2:.2f}°C")
    print(f"Fetch count: {cache.get_fetch_count()} (should be 1 - same bucket)\n")
    
    print("Example 2: Request Coalescing")
    cache.clear_cache()
    
    tasks = [cache.get_temperature(35.5, -120.5) for _ in range(50)]
    results = await asyncio.gather(*tasks)
    
    print(f"50 concurrent requests completed")
    print(f"All results identical: {len(set(results)) == 1}")
    print(f"Fetch count: {cache.get_fetch_count()} (should be 1 - coalesced)\n")
    
    print("Example 3: Independent Buckets")
    cache.clear_cache()
    
    task_a = cache.get_temperature(10.0, 10.0)
    task_b = cache.get_temperature(20.0, 20.0)
    
    results = await asyncio.gather(task_a, task_b)
    print(f"Bucket A temperature: {results[0]:.2f}°C")
    print(f"Bucket B temperature: {results[1]:.2f}°C")
    print(f"Fetch count: {cache.get_fetch_count()} (should be 2 - different buckets)")


if __name__ == "__main__":
    asyncio.run(main())
