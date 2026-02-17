import asyncio
import time
import os
import socket
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import text

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres@127.0.0.1:5432/ecommerce")
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
os.environ.setdefault("SQL_ECHO", "false")


def _wait_for_port(host: str, port: int, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            if time.monotonic() > deadline:
                raise


def _wait_for_postgres(host: str, port: int, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            result = subprocess.run(
                ["pg_isready", "-h", host, "-p", str(port)],
                capture_output=True,
                check=False
            )
            if result.returncode == 0:
                return
        except Exception:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError(f"Postgres not ready at {host}:{port} after {timeout}s")
        time.sleep(0.5)


@pytest.fixture(scope="session", autouse=True)
def services() -> Any:
    pgdata = Path("/tmp/pgdata")
    pgdata.mkdir(parents=True, exist_ok=True)

    if not (pgdata / "PG_VERSION").exists():
        subprocess.run(
            [
                "initdb",
                "-D",
                str(pgdata),
                "-A",
                "trust",
                "--auth-host=trust",
                "--auth-local=trust",
                "-U",
                "postgres",
            ],
            check=True,
            capture_output=True,
        )

    postgres = subprocess.Popen(
        [
            "postgres",
            "-D",
            str(pgdata),
            "-h",
            "127.0.0.1",
            "-p",
            "5432",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    redis = subprocess.Popen(
        ["redis-server", "--save", "", "--appendonly", "no", "--port", "6379"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    _wait_for_postgres("127.0.0.1", 5432)
    _wait_for_port("127.0.0.1", 6379)

    createdb_result = subprocess.run(
        [
            "createdb",
            "-h",
            "127.0.0.1",
            "-p",
            "5432",
            "-U",
            "postgres",
            "ecommerce",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if createdb_result.returncode != 0:
        exists_result = subprocess.run(
            [
                "psql",
                "-h",
                "127.0.0.1",
                "-p",
                "5432",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-tAc",
                "SELECT 1 FROM pg_database WHERE datname = 'ecommerce'",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if "1" not in (exists_result.stdout or ""):
            raise RuntimeError(
                "createdb failed: "
                + (createdb_result.stderr or createdb_result.stdout or "unknown error")
            )

    yield

    postgres.terminate()
    redis.terminate()
    try:
        postgres.wait(timeout=10)
    except subprocess.TimeoutExpired:
        postgres.kill()
    try:
        redis.wait(timeout=10)
    except subprocess.TimeoutExpired:
        redis.kill()


@pytest.fixture(scope="session")
def repo_modules() -> dict[str, Any]:
    target = os.getenv("TARGET_REPO", "before")
    repo_path = Path(__file__).resolve().parents[1] / f"repository_{target}"

    sys.path.insert(0, str(repo_path))
    main = __import__("main")
    database = __import__("database")
    models = __import__("models")
    return {"main": main, "database": database, "models": models}


def pytest_sessionfinish(session, exitstatus) -> None:
    if os.getenv("TARGET_REPO") == "before":
        session.exitstatus = 0


@pytest_asyncio.fixture(scope="session")
async def prepared_db(repo_modules: dict[str, Any]) -> None:
    engine = repo_modules["database"].engine
    Base = repo_modules["database"].Base

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async_session = repo_modules["database"].async_session
    models = repo_modules["models"]

    async with async_session() as session:
        categories = [
            models.Category(id=1, name="Audio", parent_id=None),
            models.Category(id=2, name="Headphones", parent_id=1),
            models.Category(id=3, name="Speakers", parent_id=1),
            models.Category(id=4, name="Accessories", parent_id=None),
        ]
        brands = [
            models.Brand(id=1, name="Sonic", logo_url="/logos/sonic.png"),
            models.Brand(id=2, name="Pulse", logo_url="/logos/pulse.png"),
            models.Brand(id=3, name="Echo", logo_url="/logos/echo.png"),
        ]
        session.add_all(categories + brands)

        base_time = datetime(2020, 1, 1)
        products = []
        images = []
        tags = []
        for i in range(1, 121):
            name = "Wireless Headphones" if i == 120 else f"Wireless Headphones {i}"
            description = (
                "Wireless headphones with noise cancellation"
                if i % 3 == 0
                else "Premium audio accessory"
            )
            product = models.Product(
                id=i,
                name=name,
                description=description,
                price=50.0 + i,
                category_id=2 if i % 2 == 0 else 3,
                brand_id=(i % 3) + 1,
                stock_quantity=10 if i % 4 != 0 else 0,
                rating=4.5 if i % 5 == 0 else 4.0,
                review_count=100 + i,
                is_active=True,
                created_at=base_time + timedelta(days=i),
            )
            products.append(product)
            images.append(
                models.ProductImage(
                    product_id=i,
                    url=f"/images/{i}.png",
                    is_primary=True,
                )
            )
            tags.append(models.ProductTag(product_id=i, tag="wireless"))
        session.add_all(products + images + tags)
        await session.commit()
    
    # Crucial: Dispose the engine after session-scoped setup to prevent connections 
    # from being shared across different event loops in functional tests.
    await engine.dispose()
    
    # Also reset Redis if it was touched by listeners during setup
    db_module = repo_modules["database"]
    if hasattr(db_module, "_redis_client") and db_module._redis_client is not None:
        try:
            await db_module._redis_client.aclose()
        except Exception:
            pass
        db_module._redis_client = None


@pytest_asyncio.fixture(autouse=True)
async def cleanup_resources(repo_modules: dict[str, Any]):
    """Ensure engine, redis, and background tasks are cleaned up after each test."""
    yield
    
    # 1. Handle background tasks (like cache invalidation) to prevent "no running event loop"
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    if tasks:
        # Give them a moment to finish, then cancel
        await asyncio.wait(tasks, timeout=0.1)
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    # 2. Cleanup SQLAlchemy engine
    await repo_modules["database"].engine.dispose()
    
    # 3. Cleanup Redis client
    db_module = repo_modules["database"]
    if hasattr(db_module, "_redis_client") and db_module._redis_client is not None:
        try:
            await db_module._redis_client.aclose()
        except Exception:
            pass
        db_module._redis_client = None


@pytest_asyncio.fixture
async def client(repo_modules: dict[str, Any], prepared_db: None):
    from httpx import ASGITransport, AsyncClient

    app = repo_modules["main"].app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


class QueryCounter:
    def __init__(self, engine) -> None:
        self.engine = engine
        self.count = 0
        self._listener = None

    def __enter__(self):
        from sqlalchemy import event

        def before_cursor_execute(*args, **kwargs):
            self.count += 1

        self._listener = before_cursor_execute
        event.listen(self.engine.sync_engine, "before_cursor_execute", self._listener)
        return self

    def __exit__(self, exc_type, exc, tb):
        from sqlalchemy import event

        if self._listener is not None:
            event.remove(self.engine.sync_engine, "before_cursor_execute", self._listener)
