const { logger } = require('../../utils/logger');

class BM25SearchService {
  constructor() {
    // BM25 search implementation
  }

  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  async bm25Search(query, limit) {
    const keywordIndex = this.documentProcessor.getKeywordIndex();
    const results = keywordIndex.search(query, { limit });
    
    const bm25Results = results.map(result => ({
      id: result.id,
      content: result.content,
      title: result.title,
      section: result.section,
      type: result.type,
      score: result.score,
      source: 'bm25'
    }));
    
    return bm25Results;
  }
}

module.exports = { BM25SearchService };
