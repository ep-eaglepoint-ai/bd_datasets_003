/**
 * candidates: Array of objects like:
 * {
 *   id: string,
 *   title: string,
 *   tags: string[],
 *   priceCents: number,
 *   sellerRating: number,   // 0..5
 *   popularity: number,     // non-negative integer
 *   createdAtMs: number     // epoch ms
 * }
 *
 * queryTokens: array of lowercased tokens (already normalized)
 * userFeatures: object like:
 * { preferredTags: string[], maxPriceCents: number|null, nowMs: number }
 *
 * Returns: array of candidate ids sorted by descending score, stable on ties
 * (if scores equal, preserve original candidate order).
 */
function rankCandidates(candidates, queryTokens, userFeatures) {
  const nowMs = userFeatures.nowMs || Date.now();
  const maxPrice = userFeatures.maxPriceCents;

  // Preferred tags: Set for O(1) membership
  const preferredSet = new Set(userFeatures.preferredTags || []);
  const hasPreferredTags = preferredSet.size > 0;

  // Precompute token count
  const qLen = queryTokens.length;

  // Build scored array
  const scored = new Array(candidates.length);

  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
    let score = 0;

    // Token score: tokenize title in one pass (no regex, no split/filter)
    const title = String(c.title || "").toLowerCase();
    const words = [];
    let word = "";

    for (let j = 0; j < title.length; j++) {
      const ch = title[j];
      const isAlnum =
        (ch >= "a" && ch <= "z") ||
        (ch >= "0" && ch <= "9");

      if (isAlnum) {
        word += ch;
      } else if (word) {
        words.push(word);
        word = "";
      }
    }
    if (word) words.push(word);

    for (let ti = 0; ti < qLen; ti++) {
      const t = queryTokens[ti];
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        if (w === t) {
          score += 10;
        } else if (w.length >= t.length && w.indexOf(t) === 0) {
          score += 3;
        }
      }
    }

    // Preferred tag boost
    if (hasPreferredTags && c.tags) {
      const tags = c.tags;
      for (let ti = 0; ti < tags.length; ti++) {
        if (preferredSet.has(tags[ti])) {
          score += 5;
          break;
        }
      }
    }

    // Price boost
    if (maxPrice != null && c.priceCents <= maxPrice) {
      score += 2;
    }

    // Seller rating boost
    score += Math.round((c.sellerRating || 0) * 2);

    // Popularity boost
    score += Math.min(15, Math.floor(Math.log((c.popularity || 0) + 1) * 5));

    // Freshness boost (same tiers)
    const ageDays = Math.floor((nowMs - (c.createdAtMs || 0)) / 86400000);
    if (ageDays <= 1) score += 20;
    else if (ageDays <= 7) score += 10;
    else if (ageDays <= 30) score += 3;

    scored[idx] = { id: c.id, score, idx };
  }

  // Stable sort on (score desc, idx asc)
  scored.sort((a, b) => {
    const diff = b.score - a.score;
    return diff !== 0 ? diff : a.idx - b.idx;
  });

  // Extract ids
  const result = new Array(scored.length);
  for (let i = 0; i < scored.length; i++) {
    result[i] = scored[i].id;
  }
  return result;
}
