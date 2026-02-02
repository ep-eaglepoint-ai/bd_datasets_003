"""
Background worker for webhook delivery retry scheduling.

This module implements a background task scheduler using APScheduler
for managing webhook delivery retries. Key features:
- Creates own database sessions (not inherited from request context)
- Graceful shutdown with in-flight request completion
- Persists pending retry records before shutdown
"""

import asyncio
import logging
import signal
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from database import get_db_session, close_db, init_db
from models import DeliveryAttempt, Webhook, DeliveryStatus
from delivery import deliver_webhook
from retry import (
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_BASE_DELAY_SECONDS,
    DEFAULT_JITTER_RANGE,
    should_retry,
    calculate_retry_delay,
    get_next_retry_time,
)


logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler: Optional[AsyncIOScheduler] = None


async def process_scheduled_retry():
    """
    Process pending retry deliveries.
    
    This is called periodically by the scheduler to check for and process
    deliveries that are ready for retry.
    """
    # Create our own database session (not inherited from request context)
    session = await get_db_session()
    
    try:
        # Find deliveries ready for retry
        now = datetime.now(timezone.utc)
        
        result = await session.execute(
            select(DeliveryAttempt)
            .where(DeliveryAttempt.status == DeliveryStatus.RETRYING)
            .where(DeliveryAttempt.next_retry_at <= now)
            .order_by(DeliveryAttempt.next_retry_at.asc())
            .limit(100)  # Process in batches
        )
        
        pending_retries = result.scalars().all()
        
        if not pending_retries:
            return
        
        logger.info(f"Processing {len(pending_retries)} scheduled retries")
        
        for attempt in pending_retries:
            try:
                # Get webhook
                webhook_result = await session.execute(
                    select(Webhook).where(Webhook.id == attempt.webhook_id)
                )
                webhook = webhook_result.scalar_one_or_none()
                
                if not webhook or not webhook.is_active:
                    logger.warning(
                        f"Webhook {attempt.webhook_id} not found or inactive, "
                        f"marking retry as failed"
                    )
                    attempt.status = DeliveryStatus.FAILED
                    attempt.error_message = "Webhook not found or inactive"
                    attempt.completed_at = datetime.now(timezone.utc)
                    await session.commit()
                    continue
                
                # Check max attempts
                if not should_retry(attempt.attempt_number + 1, DEFAULT_MAX_ATTEMPTS):
                    logger.info(
                        f"Max retries exceeded for delivery {attempt.id}"
                    )
                    attempt.status = DeliveryStatus.FAILED
                    attempt.error_message = "Max retry attempts exceeded"
                    attempt.completed_at = datetime.now(timezone.utc)
                    await session.commit()
                    continue
                
                # Attempt delivery
                attempt.status = DeliveryStatus.PENDING  # Reset to pending for delivery
                await session.commit()
                
                await deliver_webhook(session, attempt, webhook)
                
                # Schedule next retry if failed
                if attempt.status == DeliveryStatus.FAILED:
                    next_retry = await schedule_next_retry(session, attempt)
                    if next_retry:
                        logger.info(
                            f"Scheduled retry {next_retry.attempt_number} "
                            f"for delivery {attempt.id} at {next_retry.next_retry_at}"
                        )
                
            except Exception as e:
                logger.exception(f"Error processing retry for delivery {attempt.id}: {e}")
                await session.rollback()
        
    except Exception as e:
        logger.exception(f"Error in process_scheduled_retry: {e}")
    finally:
        await session.close()


async def schedule_next_retry(
    session,
    attempt: DeliveryAttempt
) -> Optional[DeliveryAttempt]:
    """
    Schedule the next retry for a failed delivery.
    
    Args:
        session: Database session.
        attempt: The failed delivery attempt.
    
    Returns:
        New DeliveryAttempt for the next retry, or None if max attempts exceeded.
    """
    next_attempt_number = attempt.attempt_number + 1
    
    if not should_retry(next_attempt_number, DEFAULT_MAX_ATTEMPTS):
        logger.info(
            f"Max retries exceeded for delivery {attempt.id} "
            f"({attempt.attempt_number}/{DEFAULT_MAX_ATTEMPTS})"
        )
        return None
    
    # Calculate next retry time
    next_retry_at = get_next_retry_time(
        next_attempt_number,
        DEFAULT_BASE_DELAY_SECONDS,
        DEFAULT_JITTER_RANGE
    )
    
    # Create new attempt for retry
    retry_attempt = DeliveryAttempt(
        webhook_id=attempt.webhook_id,
        idempotency_key=attempt.idempotency_key,
        attempt_number=next_attempt_number,
        status=DeliveryStatus.RETRYING,
        payload=attempt.payload,
        payload_size=attempt.payload_size,
        created_at=datetime.now(timezone.utc),
        next_retry_at=next_retry_at,
    )
    
    session.add(retry_attempt)
    
    # Update original attempt status
    attempt.status = DeliveryStatus.RETRYING
    attempt.next_retry_at = next_retry_at
    
    await session.commit()
    await session.refresh(retry_attempt)
    
    return retry_attempt


def start_scheduler():
    """
    Start the background scheduler for retry processing.
    
    The scheduler runs every 5 seconds to check for pending retries.
    """
    global scheduler
    
    if scheduler is not None:
        logger.warning("Scheduler already running")
        return
    
    scheduler = AsyncIOScheduler()
    
    # Add job to process scheduled retries every 5 seconds
    scheduler.add_job(
        process_scheduled_retry,
        IntervalTrigger(seconds=5),
        id="process_scheduled_retry",
        name="Process webhook delivery retries",
        replace_existing=True,
    )
    
    scheduler.start()
    logger.info("Background scheduler started")


async def stop_scheduler(graceful: bool = True):
    """
    Stop the background scheduler gracefully.
    
    Args:
        graceful: If True, wait for in-flight deliveries to complete.
    """
    global scheduler
    
    if scheduler is None:
        logger.warning("No scheduler running")
        return
    
    logger.info("Stopping background scheduler...")
    
    if graceful:
        # Wait for in-flight deliveries
        logger.info("Waiting for in-flight deliveries to complete...")
        
        # Give some time for current jobs to complete
        await asyncio.sleep(2)
        
        # Ensure all pending retries are persisted
        session = await get_db_session()
        try:
            # Update all RETRYING records with valid next_retry_at
            now = datetime.now(timezone.utc)
            result = await session.execute(
                select(DeliveryAttempt)
                .where(DeliveryAttempt.status == DeliveryStatus.RETRYING)
            )
            retrying = result.scalars().all()
            
            for attempt in retrying:
                if attempt.next_retry_at is None:
                    # Schedule retry time if missing
                    attempt.next_retry_at = get_next_retry_time(
                        attempt.attempt_number + 1,
                        DEFAULT_BASE_DELAY_SECONDS,
                        DEFAULT_JITTER_RANGE
                    )
            
            await session.commit()
            logger.info(f"Persisted {len(retrying)} pending retry records")
        except Exception as e:
            logger.error(f"Error persisting retry records: {e}")
            await session.rollback()
        finally:
            await session.close()
    
    # Shutdown scheduler
    scheduler.shutdown(wait=graceful)
    scheduler = None
    logger.info("Background scheduler stopped")


def setup_signal_handlers():
    """
    Setup signal handlers for graceful shutdown.
    
    Handles SIGINT (Ctrl+C) and SIGTERM for container orchestration.
    """
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        
        async def shutdown():
            await stop_scheduler(graceful=True)
            await close_db()
            import sys
            sys.exit(0)
        
        asyncio.create_task(shutdown())
    
    import signal
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


async def run_worker():
    """
    Run the background worker process.
    
    This is the main entry point for the worker process.
    """
    # Initialize database
    await init_db()
    
    # Setup signal handlers
    setup_signal_handlers()
    
    # Start scheduler
    start_scheduler()
    
    # Keep the worker running
    try:
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("Worker cancelled")
    finally:
        await stop_scheduler(graceful=True)
        await close_db()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    asyncio.run(run_worker())
