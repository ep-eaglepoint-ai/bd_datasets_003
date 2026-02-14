
def harmonize_permissions(vault, updates):
    """Broken: Ignores dedup (integrates duplicates)."""
    
    TIER_RANKS = {"Bot": 0, "Moderator": 1, "Admin": 2, "Owner": 3}
    def _rank(t): return TIER_RANKS.get(t, -1)

    report = {
        "INTEGRATED": [],
        "SUPERSEDED": [],
        "PENDING_PARENT": [],
        "DUPLICATE": [],
        "AUDIT": []
    }
    seq_no = 0
    
    # We will just treat duplicates as normal updates
    # If they are same tier as current, they might supersede or overwrite?
    # If they are identical, they overwrite with same value.
    # But report will have 2 INTEGRATED for same signature.
    
    for update in updates:
        uid = update['update_id']
        doc = update['doc_id']
        user = update['user_id']
        tier = update['source_tier']
        
        curr = vault.get(doc, {}).get(user)
        curr_rank = _rank(curr['tier']) if curr else -1
        new_rank = _rank(tier)
        
        if curr and new_rank < curr_rank:
            report["SUPERSEDED"].append(uid)
            report["AUDIT"].append({
                "seq_no": seq_no, "update_id": uid, "doc_id": doc, "user_id": user, 
                "outcome": "SUPERSEDED", "reason": "Tier low"
            })
            seq_no += 1
            continue
            
        # BUG: No dedup check
        
        if doc not in vault: vault[doc] = {}
        vault[doc][user] = {"permission": update['permission'], "tier": tier}
        
        report["INTEGRATED"].append(uid)
        report["AUDIT"].append({
             "seq_no": seq_no, "update_id": uid, "doc_id": doc, "user_id": user,
             "outcome": "INTEGRATED", "reason": "Integrated (dedup ignored)"
        })
        seq_no += 1
        
    return report
