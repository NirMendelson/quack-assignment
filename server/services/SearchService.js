const axios = require('axios');
const { logger } = require('../utils/logger');
const { QueryProcessor } = require('./queryProcessor');

class SearchService {
  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
    this.documentProcessor = null;
    this.queryProcessor = new QueryProcessor();
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

      // Process query with expansion and variations
      const processedQuery = this.queryProcessor.processQuery(query);
      
      // Get results from multiple search strategies
      const results = await this.hybridSearch(processedQuery, limit);
      
      // Apply domain-specific reranking
      const rerankedResults = this.rerankResults(results, processedQuery);
      
      // Return top results
      const finalResults = rerankedResults.slice(0, limit);
      
      logger.info(`Found ${finalResults.length} relevant chunks`);
      return finalResults;

    } catch (error) {
      logger.error('Error in search:', error.message);
      throw error;
    }
  }

  async hybridSearch(processedQuery, limit) {
    const allResults = new Map();
    
    // 1. Exact phrase search (highest priority)
    const exactResults = await this.exactPhraseSearch(processedQuery, limit);
    exactResults.forEach(result => {
      allResults.set(result.id, { ...result, source: 'exact', baseScore: result.score });
    });
    
    // 2. Keyword search with expanded terms
    const keywordResults = await this.enhancedKeywordSearch(processedQuery, limit);
    keywordResults.forEach(result => {
      const existing = allResults.get(result.id);
      if (existing) {
        existing.keywordScore = result.score;
        existing.score = Math.max(existing.score, result.score * 0.8); // Slightly lower than exact
      } else {
        allResults.set(result.id, { ...result, source: 'keyword', baseScore: result.score });
      }
    });
    
    // 3. Semantic search with query variations
    const semanticResults = await this.enhancedSemanticSearch(processedQuery, limit);
    semanticResults.forEach(result => {
      const existing = allResults.get(result.id);
      if (existing) {
        existing.semanticScore = result.score;
        existing.score = Math.max(existing.score, result.score * 0.6); // Lower than keyword
      } else {
        allResults.set(result.id, { ...result, source: 'semantic', baseScore: result.score });
      }
    });
    
    return Array.from(allResults.values());
  }

  async exactPhraseSearch(processedQuery, limit) {
    const chunks = this.documentProcessor.getChunks();
    const results = [];
    
    for (const chunk of chunks) {
      let maxScore = 0;
      let matchedPhrase = '';
      
      // Check each exact phrase
      processedQuery.exactPhrases.forEach(phrase => {
        if (chunk.content.toLowerCase().includes(phrase)) {
          const score = phrase.split(' ').length * 10; // Longer phrases get higher scores
          if (score > maxScore) {
            maxScore = score;
            matchedPhrase = phrase;
          }
        }
      });
      
      if (maxScore > 0) {
        results.push({
          id: chunk.id,
          content: chunk.content,
          title: chunk.title,
          section: chunk.section,
          type: chunk.type,
          score: maxScore,
          matchedPhrase: matchedPhrase
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async enhancedKeywordSearch(processedQuery, limit) {
    const keywordIndex = this.documentProcessor.getKeywordIndex();
    const allResults = new Map();
    
    // Search with each query variation
    for (const variation of processedQuery.variations) {
      const results = keywordIndex.search(variation, { limit: limit * 2 });
      
      results.forEach(result => {
        const existing = allResults.get(result.id);
        if (existing) {
          existing.score = Math.max(existing.score, result.score);
        } else {
          allResults.set(result.id, {
            id: result.id,
            content: result.content,
            title: result.title,
            section: result.section,
            type: result.type,
            score: result.score
          });
        }
      });
    }
    
    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async enhancedSemanticSearch(processedQuery, limit) {
    const allResults = new Map();
    
    // Search with each query variation
    for (const variation of processedQuery.variations) {
      const results = await this.semanticSearch(variation, limit * 2);
      
      results.forEach(result => {
        const existing = allResults.get(result.id);
        if (existing) {
          existing.score = Math.max(existing.score, result.score);
        } else {
          allResults.set(result.id, result);
        }
      });
    }
    
    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  rerankResults(results, processedQuery) {
    return results.map(result => {
      // Calculate domain-specific relevance score
      const relevanceScore = this.queryProcessor.calculateRelevanceScore(result, processedQuery);
      
      // Combine with original score
      const finalScore = (result.score * 0.7) + (relevanceScore * 0.3);
      
      return {
        ...result,
        score: finalScore,
        relevanceScore: relevanceScore
      };
    }).sort((a, b) => b.score - a.score);
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
