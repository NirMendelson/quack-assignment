const { logger } = require('../../utils/logger');

class RRFusionService {
  constructor() {
    // RRF fusion implementation
  }

  /**
   * Apply Reciprocal Rank Fusion (RRF) to combine results
   */
  applyRRFFusion(resultSets, poolSize, exactBonusesById = new Map()) {
    const rrfK = 60; // keep this as is
    const scores = new Map();

    // Fuse bm25 and semantic only
    Object.entries(resultSets).forEach(([source, results]) => {
      results.forEach((result, index) => {
        const rrfScore = 1 / (rrfK + index + 1);

        if (scores.has(result.id)) {
          const existing = scores.get(result.id);
          existing.rrfScore += rrfScore;
          existing.sources[source] = { rank: index + 1, score: result.score };
        } else {
          scores.set(result.id, {
            ...result,
            rrfScore,
            sources: { [source]: { rank: index + 1, score: result.score } }
          });
        }
      });
    });

    // Add tiny exact bonus after fusion
    for (const [id, bonus] of exactBonusesById.entries()) {
      const entry = scores.get(id);
      if (entry) {
        entry.exactBonus = bonus;
        entry.rrfScore += bonus;          // add as a nudge
        entry.sources.exact = { bonus };  // for debugging only
      }
    }

    // Finalize scores and slice
    const allResults = Array.from(scores.values());
    allResults.forEach(r => { r.score = r.rrfScore; });

    const finalResults = allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, poolSize);

    return finalResults;
  }
}

module.exports = { RRFusionService };
