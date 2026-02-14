import hashlib
import copy

TIER_RANKS = {"Bot": 0, "Moderator": 1, "Admin": 2, "Owner": 3}

def _get_tier_rank(tier_name):
    return TIER_RANKS.get(tier_name, -1)

def harmonize_permissions(vault, updates):
    """
    Reference implementation of the harmonization engine.
    
    Args:
        vault: Dict representing current permissions state. 
               Format: {doc_id: {user_id: {"permission": ..., "tier": ...}}}
        updates: List of update dicts.
        
    Returns:
        report: Dict with classifications and audit trail.
    """
    
    # Internal state for processing (working copy of vault)
    # The engine spec doesn't strictly say if we should mutate vault, 
    # but the harness will pass a deepcopy anyway.
    # We will work on 'working_vault' and strictly return a report.
    # However, the harness expects 'vault' to be mutated? 
    # "harmonize_permissions(vault, updates) -> report"
    # "vault is a mutable in-memory dict".
    # Usually these engines mutate in place.
    
    working_vault = vault # Alias for clarity that we are modifying it.
    
    # Sort updates by timestamp to simulate causal ordering (best effort)
    # In a real distributed system, we might process in arrival order, 
    # but for a deterministic reference, sorting is safer.
    # The prompt says "ordering is not guaranteed" in timestamp, but 
    # usually logic relies on time.
    # Let's assume processing in provided order if timestamps are ambiguous,
    # but sorting by timestamp is the standard "harmonization" approach.
    sorted_updates = sorted(updates, key=lambda x: x['timestamp'])

    report = {
        "INTEGRATED": [],
        "SUPERSEDED": [],
        "PENDING_PARENT": [],
        "DUPLICATE": [],
        "AUDIT": []
    }
    
    # Track seen signatures for deduplication: (doc_id, user_id, signature) -> bool
    seen_signatures = set()
    
    # Seq no for audit
    seq_no = 0

    for update in sorted_updates:
        doc_id = update['doc_id']
        user_id = update['user_id']
        signature = update['signature']
        tier = update['source_tier']
        is_refinement = update['is_refinement']
        update_id = update['update_id']
        
        # 1. Dedup check
        dedup_key = (doc_id, user_id, signature)
        
        # Check if we have already integrated this signature
        # Note: The rule says "If an update arrives whose signature matches an update already integrated..."
        # It implies we track what we *integrated*.
        if dedup_key in seen_signatures:
            report["DUPLICATE"].append(update_id)
            report["AUDIT"].append({
                "seq_no": seq_no,
                "update_id": update_id,
                "doc_id": doc_id,
                "user_id": user_id,
                "outcome": "DUPLICATE",
                "reason": "Signature already integrated"
            })
            seq_no += 1
            continue

        # Get current state
        current_state = working_vault.get(doc_id, {}).get(user_id)
        current_tier_rank = -1
        if current_state:
            current_tier_rank = _get_tier_rank(current_state['tier'])
        
        update_tier_rank = _get_tier_rank(tier)

        # 2. Supersession Check
        # "An update with tier lower than the current applied tier... must be classified as SUPERSEDED"
        if current_state and update_tier_rank < current_tier_rank:
            report["SUPERSEDED"].append(update_id)
            report["AUDIT"].append({
                "seq_no": seq_no,
                "update_id": update_id,
                "doc_id": doc_id,
                "user_id": user_id,
                "outcome": "SUPERSEDED",
                "reason": f"Current tier {current_state['tier']} > Update tier {tier}"
            })
            seq_no += 1
            continue

        # 3. Refinement Check
        if is_refinement:
            # "may only be integrated if the target ... already has an applied permission set by a tier >= the refinement’s source_tier"
            # It implies parent MUST satisfy >= tier.
            # If no parent (current_state is None), it fails (None is not >= tier).
            
            has_parent = current_state is not None
            parent_tier_satisfies = False
            if has_parent:
                if current_tier_rank >= update_tier_rank:
                    parent_tier_satisfies = True
            
            if not (has_parent and parent_tier_satisfies):
                report["PENDING_PARENT"].append(update_id)
                report["AUDIT"].append({
                    "seq_no": seq_no,
                    "update_id": update_id,
                    "doc_id": doc_id,
                    "user_id": user_id,
                    "outcome": "PENDING_PARENT",
                    "reason": "Missing eligible parent"
                })
                seq_no += 1
                continue
        
        # 4. Integrate
        # Apply changes
        if doc_id not in working_vault:
            working_vault[doc_id] = {}
        
        working_vault[doc_id][user_id] = {
            "permission": update['permission'],
            "tier": tier
        }
        
        report["INTEGRATED"].append(update_id)
        report["AUDIT"].append({
            "seq_no": seq_no,
            "update_id": update_id,
            "doc_id": doc_id,
            "user_id": user_id,
            "outcome": "INTEGRATED",
            "reason": "Applied successfully"
        })
        seq_no += 1
        
        # Mark signature as integrated
        seen_signatures.add(dedup_key)

    return report
