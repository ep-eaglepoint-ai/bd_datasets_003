
def harmonize_permissions(vault, updates):
    """Broken: Ignores refinement rule (integrates refinements even if no parent)."""
    
    # We should respect tier to avoid that failure, but fail refinement check.
    
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
            
        # BUG: We skip refinement check!
        
        if doc not in vault: vault[doc] = {}
        vault[doc][user] = {"permission": update['permission'], "tier": tier}
        
        report["INTEGRATED"].append(uid)
        report["AUDIT"].append({
             "seq_no": seq_no, "update_id": uid, "doc_id": doc, "user_id": user,
             "outcome": "INTEGRATED", "reason": "Integrated (refinement ignored)"
        })
        seq_no += 1
        
    return report
