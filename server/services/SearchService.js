const axios = require('axios');
const { logger } = require('../utils/logger');

class SearchService {
  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
    this.documentProcessor = null;
  }

  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  async search(query, limit = 15) {
    try {
      if (!this.documentProcessor) {
        throw new Error('Document processor not initialized');
      }

      logger.info(`Searching for: ${query}`);

      // Get keyword search results
      const keywordResults = this.keywordSearch(query, limit);
      
      // Get semantic search results
      const semanticResults = await this.semanticSearch(query, limit);
      
      // Merge and deduplicate results
      const mergedResults = this.mergeResults(keywordResults, semanticResults);
      
      // Sort by combined score
      const sortedResults = mergedResults
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info(`Found ${sortedResults.length} relevant chunks`);
      return sortedResults;

    } catch (error) {
      logger.error('Error in search:', error.message);
      throw error;
    }
  }

  keywordSearch(query, limit) {
    const keywordIndex = this.documentProcessor.getKeywordIndex();
    const results = keywordIndex.search(query, { limit });
    
    return results.map(result => ({
      id: result.id,
      content: result.content,
      title: result.title,
      section: result.section,
      type: result.type,
      score: result.score,
      source: 'keyword'
    }));
  }

  async semanticSearch(query, limit) {
    try {
      // Generate embedding for query using Voyage AI REST API
      const response = await axios.post('https://api.voyageai.com/v1/embeddings', {
        input: [query],
        model: 'voyage-3-large',
        input_type: 'query'
      }, {
        headers: {
          'Authorization': `Bearer ${this.voyageApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const queryVector = response.data.data[0].embedding;
      
      // Get all chunks and embeddings
      const chunks = this.documentProcessor.getChunks();
      const embeddings = this.documentProcessor.getEmbeddings();
      
      // Calculate cosine similarity
      const similarities = [];
      
      for (const chunk of chunks) {
        const chunkEmbedding = embeddings.get(chunk.id);
        if (chunkEmbedding) {
          const similarity = this.cosineSimilarity(queryVector, chunkEmbedding);
          similarities.push({
            id: chunk.id,
            content: chunk.content,
            title: chunk.title,
            section: chunk.section,
            type: chunk.type,
            score: similarity,
            source: 'semantic'
          });
        }
      }
      
      // Sort by similarity and return top results
      return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    } catch (error) {
      logger.error('Error in semantic search:', error.message);
      return [];
    }
  }

  mergeResults(keywordResults, semanticResults) {
    const merged = new Map();
    
    // Add keyword results
    keywordResults.forEach(result => {
      merged.set(result.id, {
        ...result,
        keywordScore: result.score,
        semanticScore: 0
      });
    });
    
    // Add semantic results
    semanticResults.forEach(result => {
      const existing = merged.get(result.id);
      if (existing) {
        existing.semanticScore = result.score;
        existing.score = (existing.keywordScore + result.score) / 2; // Average
      } else {
        merged.set(result.id, {
          ...result,
          keywordScore: 0,
          semanticScore: result.score,
          score: result.score
        });
      }
    });
    
    return Array.from(merged.values());
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
}

module.exports = { SearchService };
