# Trajectory: Building a Collaborative Playlist Voting Application

## The Problem: The "Fair Play" Conflict

In group music sessions, traditional playlists follow a simple FIFO rule (first song added plays first). This leads to one person hijacking the vibe by adding many songs.  
We needed a system where the group collectively influences the order through voting, while preventing spam and ensuring fairness.

**Key Challenges:**
- **Dynamic reordering** — queue must re-sort instantly after every vote.
- **Strict constraints** — no UUID libraries, no databases, no built-in sorting helpers — everything manual.
- **Vote integrity** — one vote per user per song, changes replace old votes.

## The Solution: Manual Scoring + Identity Mapping

We used a **single source of truth** pattern with JSON file storage.

- **Identity Map for Votes**  
  Votes stored as nested object: `{ "songId": { "userId": "up" | "down" } }`  
  → Using `userId` as key **prevents** duplicate votes automatically (overwrite replaces previous vote).

- **Calculated Score (on-the-fly)**  
  Score = (up votes count) - (down votes count)  
  → Avoids storing a mutable `score` field that can desync.

- **Tie-Breaker (Temporal Priority)**  
  When scores are equal → earliest-added song wins.  
  Tracked with `addedAt: Date.now()` (millisecond precision).

## Implementation Steps

1. **Custom ID Generator**  
   Built a simple 8-char alphanumeric generator (no UUID library allowed).  
   → Lightweight, fulfills requirement without external dependencies.

2. **JSON as "Database"**  
   Used Node.js `fs` module for read-modify-write on a single JSON file.  
   → Every API call reads current state, modifies, writes back — simple and atomic enough for this scale.

3. **Manual Sorting Logic**  
   Implemented custom comparator in `manualSort`:  
   - Primary: higher score first  
   - Tie: earlier `addedAt` first  
   → Used stable `.sort()` behavior in modern Node.js to preserve relative order on equal votes.

4. **Vote Replacement**  
   When user re-votes, the vote map key is overwritten → score automatically recalculates correctly (no need to manually adjust ±2).

## Testing Approach

We simulated real group scenarios in Jest:

- Single user votes up → score +1
- Multiple users vote up → score accumulates
- User changes vote from up to down → score drops by 2 (from +1 to -1)
- Tie between two songs → earlier-added song stays first
- Edge cases: invalid votes, remove song (votes deleted), empty queue

## Recommended Resources

- **JavaScript Sorting Explained**  
  [YouTube: Learn JavaScript SORTING in 6 minutes!](https://youtu.be/CTHhlx25X-U?si=WYId1NpzEW8i58vh) — great for understanding custom comparators.

- **Random String Generation**  
  [Stack Overflow: Generate a string of random characters](https://stackoverflow.com/questions/1349404/generate-a-string-of-random-characters) — inspired our custom ID generator.

- **REST API Design**  
  [YouTube: REST API Design Best Practices](https://www.youtube.com/watch?v=lsMQRaeKNDk) — guided POST for adding/voting, DELETE for removal.

- **Node.js File System Module**  
  [YouTube: FS Module in Node JS for Beginners](https://www.youtube.com/watch?v=dulKfnQ155E) — helped with JSON read/write logic.

## Final Thoughts

The project forced us to go back to basics: manual ID generation, file-based persistence, and custom sorting.  
The result is a clean, fair, and fully manual collaborative queue — exactly what the constraints demanded.

Done the old-school way: Stack Overflow, YouTube tutorials, trial & error, and lots of console.logs.