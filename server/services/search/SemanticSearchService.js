const axios = require('axios');
const { logger } = require('../../utils/logger');

class SemanticSearchService {
  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
  }

  setDocumentProcessor(processor) {
    this.documentProcessor = processor;
  }

  async semanticSearch(query, limit) {
    try {
      // Get query embedding
      const queryEmbedding = await this.getQueryEmbedding(query);
      
      // Get all chunks and their embeddings
      const chunks = this.documentProcessor.getChunks();
      const embeddings = this.documentProcessor.getEmbeddings();
      
      // Calculate similarities
      const similarities = [];
      for (const chunk of chunks) {
        const chunkEmbedding = embeddings.get(chunk.id);
        if (chunkEmbedding) {
          const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
          similarities.push({
            ...chunk,
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

  async getQueryEmbedding(query) {
    try {
      const response = await axios.post('https://api.voyageai.com/v1/embeddings', {
        input: query,
        model: 'voyage-3'
      }, {
        headers: {
          'Authorization': `Bearer ${this.voyageApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data.data[0].embedding;
    } catch (error) {
      logger.error('Error getting query embedding:', error.message);
      throw error;
    }
  }

  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = { SemanticSearchService };
