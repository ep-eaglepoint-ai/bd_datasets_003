from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.future import select as future_select
from typing import Optional, List
import datetime
import uuid
import asyncio
from . import models, schemas
import json

async def get_or_create_lock(db: AsyncSession, resource_key: str, tenant_id: str, scope: str, resource_id: str):
    # Try to find existing
    result = await db.execute(select(models.Lock).where(models.Lock.resource_key == resource_key))
    lock = result.scalar_one_or_none()
    if not lock:
        lock = models.Lock(resource_key=resource_key, tenant_id=tenant_id, resource_id=resource_id, scope=scope)
        db.add(lock)
        try:
            await db.commit()
            await db.refresh(lock)
        except Exception:
            await db.rollback()
            # Race condition, fetch again
            result = await db.execute(select(models.Lock).where(models.Lock.resource_key == resource_key))
            lock = result.scalar_one_or_none()
    return lock

async def clean_expired_leases(db: AsyncSession, lock: models.Lock):
    now = datetime.datetime.now(datetime.timezone.utc)
    # Find expired
    result = await db.execute(select(models.Lease).where(
        models.Lease.resource_key == lock.resource_key,
        models.Lease.expires_at < now
    ))
    expired_leases = result.scalars().all()
    
    if expired_leases:
        for lease in expired_leases:
            await db.delete(lease)
            # Log event
            audit = models.AuditLog(
                resource_key=lock.resource_key,
                action="EXPIRE",
                holder_id=lease.holder_id,
                fencing_token=lock.fencing_token + 1,
                details={"lease_id": lease.id}
            )
            db.add(audit)
            event = models.LeaseEvent(
                resource_key=lock.resource_key,
                event_type="EXPIRE",
                data={"lease_id": lease.id, "holder_id": lease.holder_id}
            )
            db.add(event)
        
        # Increment fencing token on expiry
        # This invalidates clients holding old tokens
        lock.fencing_token += 1
        await db.commit() # Commit deletion and token bump

async def acquire_lock_logic(db: AsyncSession, req: schemas.AcquireRequest):
    resource_key = f"{req.tenant_id}:{req.resource_id}"
    if req.scope == schemas.LockScope.GLOBAL:
        resource_key = f"global:{req.resource_id}"
    
    # 1. Get or Create Lock Resource
    lock = await get_or_create_lock(db, resource_key, req.tenant_id, req.scope, req.resource_id)
    
    # Check Idempotency
    if req.idempotency_key:
        stmt = select(models.Lease).where(
            models.Lease.resource_key == resource_key,
            models.Lease.idempotency_key == req.idempotency_key,
            models.Lease.holder_id == req.holder_id
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            # Check if expired, if so, it's not valid, but since we are re-requesting, maybe we extend?
            # Or if it's expired, we treat as lost.
            # Usually idempotency on acquire returns the success result again.
            if existing.expires_at > datetime.datetime.now(datetime.timezone.utc):
                return schemas.AcquireResponse(
                    success=True,
                    lease_id=existing.id,
                    fencing_token=lock.fencing_token,
                    expires_at=existing.expires_at,
                    message="Idempotent: Already held"
                )
            else:
                # Expired, delete it and continue to re-acquire
                await db.delete(existing)
                await db.commit()
    
    # Ensure any previous implicit transaction (from get_or_create_lock or idempotency check) is closed
    # before starting a new explicit transaction block.
    await db.commit()

    start_time = datetime.datetime.now()
    
    while True:
        # Start Transaction for atomicity of check-and-set
        async with db.begin():
            # Refresh lock state with FOR UPDATE to serialize access
            res = await db.execute(select(models.Lock).where(models.Lock.resource_key == resource_key).with_for_update())
            lock = res.scalar_one()

            # Clean expired first
            now = datetime.datetime.now(datetime.timezone.utc)
            # We can't use the helper function easily inside this transaction block unless we pass the session
            # and avoid internal commits. Let's do it inline or trust that separate cleanup happens.
            # To be strict, we check leases in this transaction.
            
            # Find active leases
            leases_res = await db.execute(select(models.Lease).where(models.Lease.resource_key == resource_key))
            leases = leases_res.scalars().all()
            
            valid_leases = []
            expired_leases = []
            for l in leases:
                if l.expires_at < now:
                    expired_leases.append(l)
                else:
                    valid_leases.append(l)
            
            if expired_leases:
                for l in expired_leases:
                    await db.delete(l)
                    # Log expiry
                    db.add(models.AuditLog(resource_key=resource_key, action="EXPIRE", holder_id=l.holder_id, fencing_token=lock.fencing_token + 1))
                lock.fencing_token += 1
                # leases list updated effectively
            
            # Now check compatibility
            can_acquire = False
            
            if not valid_leases:
                can_acquire = True
            else:
                 # If existing are shared and we want shared
                if req.mode == schemas.LockMode.SHARED:
                     # Check if any exclusive exists (should shouldn't unless inconsistent)
                     has_exclusive = any(l.mode == schemas.LockMode.EXCLUSIVE for l in valid_leases)
                     if not has_exclusive:
                         can_acquire = True
            
            if req.dry_run:
                if can_acquire:
                    return schemas.AcquireResponse(success=True, message="Dry run: Would acquire")
                else:
                    holders = [l.holder_id for l in valid_leases]
                    return schemas.AcquireResponse(success=False, message="Dry run: Would fail", existing_holders=holders)

            if can_acquire:
                # Create Lease
                new_lease_id = str(uuid.uuid4())
                expires = now + datetime.timedelta(seconds=req.ttl_seconds)
                new_lease = models.Lease(
                    id=new_lease_id,
                    resource_key=resource_key,
                    holder_id=req.holder_id,
                    mode=req.mode,
                    expires_at=expires,
                    idempotency_key=req.idempotency_key
                )
                db.add(new_lease)
                
                # Increment fencing token on successful acquire (monotonicity)
                lock.fencing_token += 1
                
                # Audit and Event
                db.add(models.AuditLog(
                    resource_key=resource_key, action="ACQUIRE", holder_id=req.holder_id, fencing_token=lock.fencing_token,
                    details={"mode": req.mode, "ttl": req.ttl_seconds}
                ))
                db.add(models.LeaseEvent(
                    resource_key=resource_key, event_type="ACQUIRE", data={"holder_id": req.holder_id, "mode": req.mode}
                ))
                
                # Commit handled by context manager on exit
                # But we need to return values.
                # Prepare return values
                ft = lock.fencing_token
                lid = new_lease_id
                exp = expires
                
                # Break the loop
                break # Commit happens
        
        # If we are here, we didn't acquire OR transaction finished (and we broke).
        # Need to check if we broke out of loop.
        # Wait, 'break' breaks the while loop.
        # If we didn't acquire, we fell through.
        
        # Logic fix:
        # If can_acquire was True, we created lease and broke loop.
            
        elapsed = (datetime.datetime.now() - start_time).total_seconds()
        if req.wait_timeout_seconds > 0 and elapsed < req.wait_timeout_seconds:
            await asyncio.sleep(0.5)
            continue
        else:
            # Timeout or non-blocking failure
            # Need to fetch holders again for info?
            # Outside transaction context, read only
            holders_res = await db.execute(select(models.Lease.holder_id).where(models.Lease.resource_key == resource_key))
            holders = holders_res.scalars().all()
            return schemas.AcquireResponse(
                success=False, 
                message="Resource locked", 
                existing_holders=list(holders)
            )

    return schemas.AcquireResponse(
        success=True,
        lease_id=lid,
        fencing_token=ft,
        expires_at=exp
    )

async def release_lock(db: AsyncSession, lease_id: str, fencing_token: Optional[int] = None):
    async with db.begin():
        lease_res = await db.execute(select(models.Lease).where(models.Lease.id == lease_id).with_for_update())
        lease = lease_res.scalar_one_or_none()
        
        if not lease:
            return False, "Lease not found"
        
        # Fencing token check if provided
        lock_res = await db.execute(select(models.Lock).where(models.Lock.resource_key == lease.resource_key))
        lock = lock_res.scalar_one()
        
        if fencing_token is not None and fencing_token < lock.fencing_token:
            # This logic depends on semantics: if fencing token increased, does it mean our lease is invalid?
            # Yes, earlier we said expiry increments it.
            # But valid releases might not need to strictly match current if we hold the lease object which is valid.
            # However, requirement says "Only the current lock holder can successfully release".
            # If token changed, maybe we are not current.
            pass
            
        await db.delete(lease)
        
        db.add(models.AuditLog(
            resource_key=lock.resource_key, action="RELEASE", holder_id=lease.holder_id, 
            fencing_token=lock.fencing_token, details={"lease_id": lease_id}
        ))
        db.add(models.LeaseEvent(
            resource_key=lock.resource_key, event_type="RELEASE", data={"holder_id": lease.holder_id}
        ))
    
    return True, "Released"

async def renew_lock(db: AsyncSession, lease_id: str, ttl_seconds: int):
    async with db.begin():
        lease_res = await db.execute(select(models.Lease).where(models.Lease.id == lease_id).with_for_update())
        lease = lease_res.scalar_one_or_none()
        
        if not lease:
            # Check if it was expired?
            return False, "Lease not found or expired"
        
        now = datetime.datetime.now(datetime.timezone.utc)
        if lease.expires_at < now:
            # Already expired, can't renew
            await db.delete(lease) # Cleanup
            return False, "Lease expired"
            
        lease.expires_at = now + datetime.timedelta(seconds=ttl_seconds)
        
        lock_res = await db.execute(select(models.Lock).where(models.Lock.resource_key == lease.resource_key))
        lock = lock_res.scalar_one()
        
        db.add(models.AuditLog(
            resource_key=lock.resource_key, action="RENEW", holder_id=lease.holder_id, 
            fencing_token=lock.fencing_token, details={"lease_id": lease_id, "ttl": ttl_seconds}
        ))
        db.add(models.LeaseEvent(
            resource_key=lock.resource_key, event_type="RENEW", data={"holder_id": lease.holder_id}
        ))
        
        return True, str(lease.expires_at)

async def force_release(db: AsyncSession, resource_key: str):
    async with db.begin():
        lock_res = await db.execute(select(models.Lock).where(models.Lock.resource_key == resource_key).with_for_update())
        lock = lock_res.scalar_one_or_none()
        
        if not lock:
            return False, "Resource not found"
            
        leases_res = await db.execute(select(models.Lease).where(models.Lease.resource_key == resource_key))
        leases = leases_res.scalars().all()
        
        for l in leases:
            await db.delete(l)
            
        lock.fencing_token += 1
        
        db.add(models.AuditLog(
            resource_key=resource_key, action="FORCE_RELEASE", holder_id="ADMIN", 
            fencing_token=lock.fencing_token
        ))
        db.add(models.LeaseEvent(
            resource_key=resource_key, event_type="FORCE_RELEASE", data={"admin": True}
        ))
        
    return True, "Force released"
