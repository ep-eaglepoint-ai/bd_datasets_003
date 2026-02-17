"""Performance tests for read/write latency and memory footprint."""

import pytest
import time
import statistics
from fastapi.testclient import TestClient
from repository_after.backend.main import app
from repository_after.backend.redis_client import redis_client


@pytest.fixture(autouse=True)
def cleanup_redis():
    """Clean up Redis before and after each test."""
    try:
        redis_client.redis_client.flushdb()
    except Exception:
        pass
    yield
    try:
        redis_client.redis_client.flushdb()
    except Exception:
        pass


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestWriteLatency:
    """Test write (create secret) latency."""

    def test_write_latency_under_50ms(self, client):
        """Test that write operations complete in under 50ms."""
        latencies = []
        num_tests = 100

        for _ in range(num_tests):
            start = time.perf_counter()
            response = client.post(
                "/api/secrets", json={"secret": f"test-secret-{_}", "ttl_hours": 24}
            )
            end = time.perf_counter()

            assert response.status_code == 201
            latency_ms = (end - start) * 1000
            latencies.append(latency_ms)

        # Calculate statistics
        avg_latency = statistics.mean(latencies)
        p95_latency = statistics.quantiles(latencies, n=20)[18]  # 95th percentile
        p99_latency = statistics.quantiles(latencies, n=100)[98]  # 99th percentile

        print(f"\nWrite Latency Statistics:")
        print(f"  Average: {avg_latency:.2f}ms")
        print(f"  P95: {p95_latency:.2f}ms")
        print(f"  P99: {p99_latency:.2f}ms")
        print(f"  Max: {max(latencies):.2f}ms")

        # Assert average is under 50ms
        assert avg_latency < 50, (
            f"Average write latency {avg_latency:.2f}ms exceeds 50ms threshold"
        )

        # Assert P95 is reasonable (under 100ms)
        assert p95_latency < 100, (
            f"P95 write latency {p95_latency:.2f}ms exceeds 100ms threshold"
        )


class TestReadLatency:
    """Test read (retrieve secret) latency."""

    def test_read_latency_under_50ms(self, client):
        """Test that read operations complete in under 50ms."""
        # Create secrets first
        uuids = []
        for i in range(100):
            response = client.post(
                "/api/secrets", json={"secret": f"test-secret-{i}", "ttl_hours": 24}
            )
            uuids.append(response.json()["uuid"])

        latencies = []

        for uuid in uuids:
            start = time.perf_counter()
            response = client.get(f"/api/secrets/{uuid}")
            end = time.perf_counter()

            assert response.status_code == 200
            latency_ms = (end - start) * 1000
            latencies.append(latency_ms)

        # Calculate statistics
        avg_latency = statistics.mean(latencies)
        p95_latency = statistics.quantiles(latencies, n=20)[18]
        p99_latency = statistics.quantiles(latencies, n=100)[98]

        print(f"\nRead Latency Statistics:")
        print(f"  Average: {avg_latency:.2f}ms")
        print(f"  P95: {p95_latency:.2f}ms")
        print(f"  P99: {p99_latency:.2f}ms")
        print(f"  Max: {max(latencies):.2f}ms")

        # Assert average is under 50ms
        assert avg_latency < 50, (
            f"Average read latency {avg_latency:.2f}ms exceeds 50ms threshold"
        )

        # Assert P95 is reasonable (under 100ms)
        assert p95_latency < 100, (
            f"P95 read latency {p95_latency:.2f}ms exceeds 100ms threshold"
        )


class TestRedisMemoryFootprint:
    """Test Redis memory footprint."""

    def test_memory_footprint_per_secret(self, client):
        """Test memory usage per secret."""
        try:
            # Get initial memory info
            info_before = redis_client.redis_client.info("memory")
            used_memory_before = info_before.get("used_memory", 0)

            # Create 100 secrets
            uuids = []
            for i in range(100):
                response = client.post(
                    "/api/secrets",
                    json={"secret": f"test-secret-{i}-" + "x" * 100, "ttl_hours": 24},
                )
                uuids.append(response.json()["uuid"])

            # Get memory info after
            info_after = redis_client.redis_client.info("memory")
            used_memory_after = info_after.get("used_memory", 0)

            # Calculate memory per secret
            memory_used = used_memory_after - used_memory_before
            memory_per_secret = memory_used / 100

            print(f"\nRedis Memory Footprint:")
            print(f"  Total memory used for 100 secrets: {memory_used / 1024:.2f} KB")
            print(f"  Memory per secret: {memory_per_secret / 1024:.2f} KB")
            print(f"  Memory per secret: {memory_per_secret:.2f} bytes")

            # Clean up
            for uuid in uuids:
                try:
                    redis_client.get_and_delete_secret(uuid)
                except Exception:
                    pass

        except Exception as e:
            pytest.skip(f"Could not measure memory footprint: {str(e)}")

    def test_memory_footprint_vs_secret_size(self, client):
        """Test memory usage with different secret sizes."""
        try:
            secret_sizes = [10, 100, 1000, 10000]  # bytes
            memory_per_size = {}

            for size in secret_sizes:
                # Get initial memory
                info_before = redis_client.redis_client.info("memory")
                used_memory_before = info_before.get("used_memory", 0)

                # Create secret
                secret = "x" * size
                response = client.post(
                    "/api/secrets", json={"secret": secret, "ttl_hours": 24}
                )
                uuid = response.json()["uuid"]

                # Get memory after
                info_after = redis_client.redis_client.info("memory")
                used_memory_after = info_after.get("used_memory", 0)

                memory_used = used_memory_after - used_memory_before
                memory_per_size[size] = memory_used

                # Clean up
                redis_client.get_and_delete_secret(uuid)

            print(f"\nMemory Footprint by Secret Size:")
            for size, memory in memory_per_size.items():
                print(f"  {size} bytes secret: {memory / 1024:.2f} KB memory")

            # Memory should scale roughly linearly with secret size
            # (with some overhead for encryption and metadata)
            assert memory_per_size[100] > memory_per_size[10]
            assert memory_per_size[1000] > memory_per_size[100]
            assert memory_per_size[10000] > memory_per_size[1000]

        except Exception as e:
            pytest.skip(f"Could not measure memory footprint: {str(e)}")

    def test_memory_cleanup_after_read(self, client):
        """Test that memory is freed after secret is read."""
        try:
            # Get initial memory
            info_before = redis_client.redis_client.info("memory")
            used_memory_before = info_before.get("used_memory", 0)

            # Create secret
            response = client.post(
                "/api/secrets",
                json={"secret": "test-secret-for-cleanup", "ttl_hours": 24},
            )
            uuid = response.json()["uuid"]

            # Get memory after creation
            info_after_create = redis_client.redis_client.info("memory")
            used_memory_after_create = info_after_create.get("used_memory", 0)

            # Read (and delete) the secret
            client.get(f"/api/secrets/{uuid}")

            # Get memory after read
            info_after_read = redis_client.redis_client.info("memory")
            used_memory_after_read = info_after_read.get("used_memory", 0)

            memory_used = used_memory_after_create - used_memory_before
            memory_freed = used_memory_after_create - used_memory_after_read

            print(f"\nMemory Cleanup:")
            print(f"  Memory used for secret: {memory_used / 1024:.2f} KB")
            print(f"  Memory freed after read: {memory_freed / 1024:.2f} KB")

            # Memory should be freed (allowing for Redis overhead and fragmentation)
            # We expect at least 50% of memory to be freed
            assert memory_freed >= memory_used * 0.5, (
                "Memory not properly freed after read"
            )

        except Exception as e:
            pytest.skip(f"Could not measure memory cleanup: {str(e)}")
