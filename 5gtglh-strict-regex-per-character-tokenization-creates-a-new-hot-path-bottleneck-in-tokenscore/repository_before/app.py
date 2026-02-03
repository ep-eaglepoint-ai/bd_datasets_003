/**
 * candidates: Array of objects like:
 * {
 *   id: string,
 *   title: string,
 *   tags: string[],
 *   priceCents: number,
 *   sellerRating: number,
 *   popularity: number,
 *   createdAtMs: number
 * }
 *
 * queryTokens: array of lowercased tokens
 * userFeatures: {
 *   preferredTags: string[],
 *   maxPriceCents: number | null,
 *   nowMs: number
 * }
 *
 * Returns: array of candidate ids sorted by descending score.
 * If scores are equal, original order must be preserved.
 */
function rankCandidates(candidates, queryTokens, userFeatures) {
  // original implementation (provided)
}

