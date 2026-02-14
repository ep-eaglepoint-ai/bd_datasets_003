
def harmonize_permissions(vault, updates):
    """Broken: Ignores tier precedence (Admin can override Owner)."""
    
    # Simple applying everything in order, except duplicates maybe
    # Just to fail "No Unauthorized State Changes"
    
    report = {
        "INTEGRATED": [],
        "SUPERSEDED": [], # We will never supersede
        "PENDING_PARENT": [],
        "DUPLICATE": [],
        "AUDIT": []
    }
    
    seq_no = 0
    
    for update in updates:
        uid = update['update_id']
        doc = update['doc_id']
        user = update['user_id']
        
        # Blindly integrate
        if doc not in vault:
            vault[doc] = {}
            
        vault[doc][user] = {
            "permission": update['permission'],
            "tier": update['source_tier']
        }
        
        report["INTEGRATED"].append(uid)
        report["AUDIT"].append({
            "seq_no": seq_no,
            "update_id": uid,
            "doc_id": doc,
            "user_id": user,
            "outcome": "INTEGRATED",
            "reason": "Blindly integrated"
        })
        seq_no += 1
        
    return report
