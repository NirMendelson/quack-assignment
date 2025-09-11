import { logger } from '../../utils/logger.js';

class ExactPhraseSearchService {
  constructor() {
    // Exact phrase search implementation
  }

  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  // Tiny helper to normalize
  normalizeForExact(s) {
    return s
      .toLowerCase()
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/[\u2012-\u2015]/g, '-')               // dashes -> hyphen
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // nbspaces -> space
      .replace(/[^a-z0-9\s._-]/g, ' ')                // strip punctuation except a few useful chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  tokenizeWords(s) {
    return this.normalizeForExact(s).split(' ').filter(Boolean);
  }

  makeNgrams(words, n) {
    const grams = [];
    for (let i = 0; i <= words.length - n; i++) {
      grams.push(words.slice(i, i + n).join(' '));
    }
    return grams;
  }

  /**
   * Exact phrase bonus:
   * - if any trigram from query appears in chunk -> bonus = X
   * - else if any bigram from query appears in chunk -> bonus = 0.5 * X
   * Returns: { bonusesById: Map<string, number>, hits3: number, hits2: number }
   */
  async exactPhraseSearch(query, limitIgnored) {
    const X = 0.02; // keep this small so BM25/semantic dominate
    const words = this.tokenizeWords(query);

    const trigrams = this.makeNgrams(words, 3);
    const bigrams  = this.makeNgrams(words, 2);

    const chunks = this.documentProcessor.getChunks();
    const bonusesById = new Map();
    let hits3 = 0;
    let hits2 = 0;

    for (const chunk of chunks) {
      const hay = this.normalizeForExact(chunk.content);

      // First try any trigram
      let matched = trigrams.some(g => hay.includes(g));
      if (matched) {
        bonusesById.set(chunk.id, X);
        hits3++;
        continue; // do not check 2-grams if 3-gram matched
      }

      // Then try any bigram
      matched = bigrams.some(g => hay.includes(g));
      if (matched) {
        bonusesById.set(chunk.id, X * 0.5);
        hits2++;
      }
    }

    return { bonusesById, hits3, hits2, X };
  }
}

export { ExactPhraseSearchService };
