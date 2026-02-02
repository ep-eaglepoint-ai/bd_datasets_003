# filename: relationship_guard.py
# Legacy O(N) SQL implementation. 
# Imports: sqlite3 (Relational Storage)

import sqlite3

def check_visibility_legacy(viewer_id, creator_ids, db_path):
    """
    INEFFICIENT: Sequential SQL queries for every creator_id.
    Must be refactored to a NoSQL/Graph-adjacent cache strategy.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    allowed_ids = []

    for cid in creator_ids:
        # Check blocks (Directional: Creator blocks Viewer)
        cursor.execute("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?", (cid, viewer_id))
        if cursor.fetchone(): continue
        
        # Check mutes (Directional: Viewer mutes Creator)
        cursor.execute("SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?", (viewer_id, cid))
        if cursor.fetchone(): continue

        allowed_ids.append(cid)
    conn.close()
    return allowed_ids
