import { logger } from '../../utils/logger.js';
import { BM25SearchService } from './BM25SearchService.js';
import { SemanticSearchService } from './SemanticSearchService.js';
import { ExactPhraseSearchService } from './ExactPhraseSearchService.js';
import { RRFusionService } from './RRFusionService.js';

class SearchOrchestrator {
  constructor() {
    this.bm25Service = new BM25SearchService();
    this.semanticService = new SemanticSearchService();
    this.exactService = new ExactPhraseSearchService();
    this.rrfService = new RRFusionService();
    this.documentProcessor = null;
  }

  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
    this.bm25Service.setDocumentProcessor(processor);
    this.semanticService.setDocumentProcessor(processor);
    this.exactService.setDocumentProcessor(processor);
  }

  async search(query, limit = 15) {
    try {
      if (!this.documentProcessor) {
        throw new Error('Document processor not initialized');
      }

      logger.info(`Searching for: ${query}`);

      // Get candidate pool using hybrid retrieval
      const candidatePool = await this.getCandidatePool(query, 100);
      
      logger.info(`Found ${candidatePool.length} candidates`);
      return candidatePool;

    } catch (error) {
      logger.error('Error in search:', error.message);
      throw error;
    }
  }

  /**
   * Get candidate pool using hybrid retrieval (BM25 + embeddings + RRF fusion)
   */
  async getCandidatePool(query, poolSize = 100) {
    try {
      logger.info(`🔍 Getting candidate pool for: "${query}"`);
      
      // 1. BM25 search
      const bm25Results = await this.bm25Service.bm25Search(query, poolSize * 2);
      logger.info(`📊 BM25 found ${bm25Results.length} results`);
      
      // 2. Semantic search
      const semanticResults = await this.semanticService.semanticSearch(query, poolSize * 2);
      logger.info(`🧠 Semantic found ${semanticResults.length} results`);
      
      // 3. Exact - now returns bonuses, not a ranked list
      const { bonusesById, hits3, hits2, X } = await this.exactService.exactPhraseSearch(query);
      logger.info(`🎯 Exact bonus: 3-gram hits=${hits3}, 2-gram hits=${hits2}, X=${X}`);
      
      // 4. Fuse only bm25 + semantic, then add tiny exact bonus
      const fusedResults = this.rrfService.applyRRFFusion(
        { bm25: bm25Results, semantic: semanticResults },
        poolSize,
        bonusesById // pass the bonus map
      );
      
      logger.info(`🔄 RRF fused to ${fusedResults.length} candidates`);
      return fusedResults;
      
    } catch (error) {
      logger.error('Error getting candidate pool:', error);
      throw error;
    }
  }
}

export { SearchOrchestrator };
