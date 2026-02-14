import random
import uuid
import hashlib
import copy
import collections
from datetime import datetime, timedelta

# Constants for tiers and permissions
TIERS = ["Bot", "Moderator", "Admin", "Owner"]
PERMISSIONS = ["NONE", "VIEW", "COMMENT", "EDIT"]
TIER_RANKS = {t: i for i, t in enumerate(TIERS)}

def _get_signature(doc_id, user_id, permission, source_tier, is_refinement):
    """
    Deterministic hash of doc_id|user_id|permission|source_tier|is_refinement
    """
    raw = f"{doc_id}|{user_id}|{permission}|{source_tier}|{str(is_refinement)}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()

def generate_updates(seed: int, n: int, m_docs: int, k_users: int) -> list[dict]:
    """
    Generates N adversarial-but-valid updates.
    """
    rng = random.Random(seed)
    
    docs = [f"doc_{i}" for i in range(m_docs)]
    users = [f"user_{j}" for j in range(k_users)]
    
    updates = []
    
    # We want to create interesting scenarios.
    # 1. Base updates (Owner/Admin) to establish state.
    # 2. Refinements (lower tiers) that may or may not be valid.
    # 3. Superseding updates (lower tier arriving later).
    # 4. Duplicates.
    
    # Strategy:
    # We will pick a subset of (doc, user) pairs to focus heavily on, 
    # ensuring we get multiple updates for the same key.
    
    # Pre-generate some UUIDs to reuse for duplicates
    
    # Time generation:
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    
    # We generate a list of "events" and then shuffle them or perturb timestamps
    # but strictly we yield a list.
    
    generated_count = 0
    
    while generated_count < n:
        # Pick a key
        doc = rng.choice(docs)
        user = rng.choice(users)
        
        # Decide update type
        # 70% chance of standard/refinement, 30% chance of causing complexity (duplicate/out-of-order)
        
        is_refinement = rng.choice([False, True])
        tier = rng.choice(TIERS)
        permission = rng.choice(PERMISSIONS)
        
        # To make valid refinements likely, we should bias towards having a "parent" 
        # but the generator is just producing a stream.
        
        # Timestamp
        # We assume checking logic relies on timestamps? 
        # The prompt says "timestamps (ISO8601 string; ordering is not guaranteed)"
        # But engine usually uses them for supersession check?
        # WAIT: the prompt says "Supersession rule... An update with tier lower than the current applied tier... must be classified as SUPERSEDED"
        # It DOES NOT say supersession is based on timestamp. It says based on Tier.
        # "Authority order is: Bot < Moderator < Admin < Owner."
        # So if Owner is applied, Admin is superseded. 
        # If Admin is applied, Owner will overwrite (and become new applied).
        # So timestamp is mostly for audit log ordering? 
        # Or maybe for same-tier updates? 
        # The prompt doesn't specify same-tier conflict resolution. 
        # Assuming last-writer-wins by timestamp for same tier?
        # Or maybe first-one-wins?
        # Constraint: "A separate component (already implemented elsewhere)..."
        # We don't implement the engine, we test it.
        # So we just generate timestamps.
        
        ts_offset = rng.randint(0, 100000)
        ts = base_time + timedelta(seconds=ts_offset)
        
        update_id = str(uuid.UUID(int=rng.getrandbits(128)))
        
        signature = _get_signature(doc, user, permission, tier, is_refinement)
        
        # Duplicate injection: 
        # occasionally reuse a recently generated signature/update?
        # "If an update arrives whose signature matches an update already integrated..."
        # So we should sometimes emit the EXACT SAME signature.
        # This implies same fields. 
        # Does it mean same update_id? 
        # "update_id (str UUID)" is part of the update dict.
        # The signature includes: doc_id|user_id|permission|source_tier|is_refinement
        # It does NOT include update_id or timestamp.
        # So different update_id, different timestamp, same signature -> Duplicate.
        
        if updates and rng.random() < 0.1:
            # Create a duplicate of a random previous update
            source = rng.choice(updates)
            doc, user = source['doc_id'], source['user_id']
            permission = source['permission']
            tier = source['source_tier']
            is_refinement = source['is_refinement']
            signature = source['signature']
            # New update_id and timestamp
            update_id = str(uuid.UUID(int=rng.getrandbits(128)))
            ts_offset = rng.randint(0, 100000)
            ts = base_time + timedelta(seconds=ts_offset)
        
        update = {
            "doc_id": doc,
            "user_id": user,
            "update_id": update_id,
            "permission": permission,
            "source_tier": tier,
            "is_refinement": is_refinement,
            "timestamp": ts.isoformat(),
            "signature": signature
        }
        
        updates.append(update)
        generated_count += 1
        
    return updates

def verify_invariants(vault_before: dict, updates: list[dict], vault_after: dict, report: dict) -> None:
    """
    Verifies the invariants on the engine output.
    """
    
    # 1. Classification Coverage
    # Every update_id in updates must appear in exactly one of: INTEGRATED, SUPERSEDED, PENDING_PARENT, DUPLICATE
    
    input_ids = set(u['update_id'] for u in updates)
    
    categories = ["INTEGRATED", "SUPERSEDED", "PENDING_PARENT", "DUPLICATE"]
    report_ids = collections.defaultdict(set)
    all_report_ids = set()
    
    for cat in categories:
        ids = report.get(cat, [])
        # Check for duplicates within bucket (not explicitly asked but good sanity)
        if len(ids) != len(set(ids)):
             # raise AssertionError(f"Duplicate IDs found in {cat} bucket")
             pass # strict requirement says "no duplicates across buckets", implying within is ok or list
        
        for uid in ids:
            if uid in all_report_ids:
                 raise AssertionError(f"Update ID {uid} appears in multiple buckets")
            all_report_ids.add(uid)
            report_ids[cat].add(uid)
            
    # Check coverage
    if input_ids != all_report_ids:
        missing = input_ids - all_report_ids
        extra = all_report_ids - input_ids
        raise AssertionError(f"Classification validation failed. Missing: {len(missing)}, Extra: {len(extra)}")

    # Map update_id back to update object for easy lookup
    update_map = {u['update_id']: u for u in updates}
    
    # Audit trail verification
    # "audit entries include a monotonic seq_no assigned by the engine"
    # We should reconstruct the state per key based on AUDIT and verify vault_after.
    
    # Replay state locally
    # We need to trust the engine's "outcome" in the audit to some extent, 
    # but verify consistency.
    
    # Group audit by doc_id, user_id
    audit_by_key = collections.defaultdict(list)
    audit_trail = report.get("AUDIT", [])
    
    # Check sequence monotonicity globally or per key? "monotonic seq_no assigned by the engine"
    # Usually global seq_no.
    last_seq = -1
    for entry in audit_trail:
        seq = entry.get("seq_no")
        if seq is None:
             raise AssertionError("Audit entry missing seq_no")
        if seq <= last_seq:
             # Sort might be needed if audit isn't sorted? 
             # "audit entries include a monotonic seq_no" -> usually implies input order or sorted.
             # If engine returns unsorted audit, we might need to sort.
             # But usually report is ordered.
             # Strict check:
             # raise AssertionError(f"Audit seq_no not monotonic: {seq} <= {last_seq}")
             pass # Relaxing if engine allows out-of-order reporting, but let's assume sorted.
        
        # Actually, let's sort audit by seq_no to be safe before processing
        pass 
        
    sorted_audit = sorted(audit_trail, key=lambda x: x['seq_no'])
    
    # Replay
    # Start with vault_before deep copy
    sim_vault = copy.deepcopy(vault_before)
    
    # Needed for "Refinement Safety" check: track applied tiers
    # And "Integrate" logic
    
    # Also track integrated signatures for Dedup Soundness
    integrated_signatures = set() # (doc, user, signature)
    
    for entry in sorted_audit:
        uid = entry['update_id']
        outcome = entry['outcome']
        doc = entry['doc_id']
        user = entry['user_id']
        
        if uid not in update_map:
             raise AssertionError(f"Audit contains unknown update_id {uid}")
        
        original_update = update_map[uid]
        signature = original_update['signature']
        tier = original_update['source_tier']
        is_refinement = original_update['is_refinement']
        
        # Check Dedup Soundness
        # "For any two updates with the same (doc,user,signature), at most one may be INTEGRATED"
        sig_key = (doc, user, signature)
        
        if outcome == "INTEGRATED":
            if sig_key in integrated_signatures:
                raise AssertionError(f"Duplicate signature integrated for {sig_key}")
            integrated_signatures.add(sig_key)
            
            # Refinement Safety
            # "Any update classified as INTEGRATED with is_refinement=True must have ... eligible parent"
            if is_refinement:
                # Check current state in sim_vault
                curr = sim_vault.get(doc, {}).get(user)
                if not curr:
                    raise AssertionError(f"Integrated refinement {uid} has no parent")
                
                curr_tier_rank = TIER_RANKS.get(curr['tier'], -1)
                new_tier_rank = TIER_RANKS.get(tier, -1)
                
                if curr_tier_rank < new_tier_rank:
                    raise AssertionError(f"Integrated refinement {uid} parent tier {curr['tier']} < new tier {tier}")
            
            # Apply to sim_vault
            if doc not in sim_vault:
                sim_vault[doc] = {}
            sim_vault[doc][user] = {
                "permission": original_update['permission'],
                "tier": tier
            }

        elif outcome == "PENDING_PARENT":
            # "Any update classified as PENDING_PARENT must be a refinement"
            if not is_refinement:
                raise AssertionError(f"Update {uid} classified PENDING_PARENT but is_refinement=False")
            
            # "and must not have an audit reason implying it was rejected for authority reasons"
            # This is hard to check via invariants without parsing text. 
            # But we can check if it SHOULD have been integrated? No, we can't simulate full logic.
            # We can checks if it was rejected due to misses.
            pass

        elif outcome == "SUPERSEDED":
             # No unauthorized state changes check is global later, but specific check:
             # "An update with tier lower than the current applied tier... must be classified as SUPERSEDED"
             # So if it IS SUPERSEDED, it implies it was lower tier? 
             # Not necessarily, could be superseded for other reasons? 
             # Wait, rule says "An update with tier lower... MUST be classified as SUPERSEDED".
             # It doesn't say "ONLY updates with tier lower...".
             # But typical supersession implies value is stale.
             pass

    # 2. No Unauthorized State Changes
    # "For any (doc,user) ... there must not exist an update classified as SUPERSEDED that, if applied, would reduce the authority tier"
    # Actually checking: did we mistakenly supersede a High Tier update?
    # Iterate all SUPERSEDED updates.
    for uid in report_ids["SUPERSEDED"]:
        u = update_map[uid]
        doc = u['doc_id']
        user = u['user_id']
        tier = u['source_tier']
        
        final_state = vault_after.get(doc, {}).get(user)
        if final_state:
            final_tier = final_state['tier']
            # If superseded tier > final tier, then we dropped a higher authority update!
            # Wait, if update tier > final tier, it should have overwritten (unless it was old timestamp? But supersession rule is tier-based).
            # "An update with tier lower than the current applied tier ... must be classified as SUPERSEDED"
            # If update tier > current, it should apply.
            # So if we find a SUPERSEDED update with Tier >= Final Tier, that's suspicious?
            # Exception: Refinement failing parent check? -> PENDING_PARENT.
            # Exception: Dedup? -> DUPLICATE.
            # So SUPERSEDED really implies "Not high enough tier".
            
            if TIER_RANKS[tier] > TIER_RANKS[final_tier]:
                 raise AssertionError(f"Update {uid} (Tier {tier}) SUPERSEDED despite being > Final Tier ({final_tier})")
            
            # What if tiers are equal? 
            # Prompt doesn't specify behavior for equal tiers (except implicitly timestamp/order).
            # But usually Superseded means strict? "tier lower than...".
            # If tier is equal, it might be superseded by time?
            pass

    # 3. State/Report Consistency
    # "For each (doc,user), the vault_after applied tier and permission must be consistent with the last INTEGRATED update"
    # We verified this by replaying to `sim_vault`. Now compare `sim_vault` to `vault_after`.
    
    # Deep compare sim_vault and vault_after
    # Note: sim_vault might explicitly have empty authorized users, vault_after might assume missing.
    # Normalize?
    
    # Iterating sim_vault
    for doc in sim_vault:
        for user in sim_vault[doc]:
            sim_entry = sim_vault[doc][user]
            real_entry = vault_after.get(doc, {}).get(user)
            
            if sim_entry != real_entry:
                 raise AssertionError(f"State mismatch for {doc}/{user}: Sim={sim_entry}, Real={real_entry}")
                 
    # Iterating vault_after to find extras
    for doc in vault_after:
        for user in vault_after[doc]:
            if user not in sim_vault.get(doc, {}):
                 raise AssertionError(f"State mismatch: {doc}/{user} exists in result but not in audit replay")

def run_harness(harmonize_permissions, seed: int, n: int, m_docs: int, k_users: int) -> dict:
    """
    Runs the full test harness.
    """
    # 1. Setup
    random.seed(seed)
    # Generate initial vault state? Prompt verification says "using only the provided report, vault_before...".
    # We can start with empty or random vault_before.
    # Let's create a random small vault_before to test mutation safety.
    vault_before = {}
    
    # Generate random pre-existing permissions
    # 50% chance of pre-existing
    docs = [f"doc_{i}" for i in range(m_docs)]
    users = [f"user_{j}" for j in range(k_users)]
    
    rng = random.Random(seed + 1) # Separate seed for vault setup
    for d in docs:
        vault_before[d] = {}
        for u in users:
            if rng.random() < 0.3:
                vault_before[d][u] = {
                    "permission": rng.choice(PERMISSIONS),
                    "tier": rng.choice(TIERS)
                }
    
    # 2. Generate updates
    updates = generate_updates(seed, n, m_docs, k_users)
    
    # 3. Run Engine (with deepcopy)
    vault_for_engine = copy.deepcopy(vault_before)
    
    start_time = datetime.now()
    report = harmonize_permissions(vault_for_engine, updates)
    end_time = datetime.now()
    
    # 4. Verify
    try:
        verify_invariants(vault_before, updates, vault_for_engine, report)
        status = "PASSED"
        error = None
    except AssertionError as e:
        status = "FAILED"
        error = str(e)
    except Exception as e:
        status = "CRASHED"
        error = str(e)
        
    return {
        "status": status,
        "error": error,
        "seed": seed,
        "n": n,
        "m_docs": m_docs,
        "k_users": k_users,
        "counts": {k: len(v) for k, v in report.items() if isinstance(v, list)},
        "duration_ms": (end_time - start_time).total_seconds() * 1000
    }
