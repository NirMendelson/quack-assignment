const axios = require('axios');
const { logger } = require('../utils/logger');
const { QueryProcessor } = require('./queryProcessor');
const { GenericQueryAnalyzer } = require('./GenericQueryAnalyzer');

class SearchService {
  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
    this.documentProcessor = null;
    this.queryProcessor = new QueryProcessor();
    this.queryAnalyzer = new GenericQueryAnalyzer();
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

      // Get candidate pool using hybrid retrieval
      const candidatePool = await this.getCandidatePool(query, 100);
      
      logger.info(`Found ${candidatePool.length} candidates for reranking`);
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
      
      // 1. BM25 search (exact + keyword)
      const bm25Results = await this.bm25Search(query, poolSize * 2);
      logger.info(`📊 BM25 found ${bm25Results.length} results`);
      
      // 2. Semantic search
      const semanticResults = await this.semanticSearch(query, poolSize * 2);
      logger.info(`🧠 Semantic found ${semanticResults.length} results`);
      
      // 3. Exact phrase search (highest priority)
      const exactResults = await this.exactPhraseSearch(query, poolSize);
      logger.info(`🎯 Exact found ${exactResults.length} results`);
      
      // 4. Apply RRF fusion
      const fusedResults = this.applyRRFFusion({
        exact: exactResults,
        bm25: bm25Results,
        semantic: semanticResults
      }, poolSize);
      
      logger.info(`🔄 RRF fused to ${fusedResults.length} candidates`);
      return fusedResults;
      
    } catch (error) {
      logger.error('Error getting candidate pool:', error);
      throw error;
    }
  }

  /**
   * BM25 search combining exact phrases and keywords
   */
  async bm25Search(query, limit) {
    const keywordIndex = this.documentProcessor.getKeywordIndex();
    const results = keywordIndex.search(query, { limit });
    
    // Debug: Log BM25 results for 2FA chunks
    const bm25Results = results.map(result => ({
      id: result.id,
      content: result.content,
      title: result.title,
      section: result.section,
      type: result.type,
      score: result.score,
      source: 'bm25'
    }));
    
    // Find and log 2FA-related chunks
    const twoFactorChunks = bm25Results.filter(result => 
      result.content.toLowerCase().includes('two-factor') || 
      result.content.toLowerCase().includes('2fa') ||
      result.id === 'sc_65'
    );
    
    if (twoFactorChunks.length > 0) {
      console.log(`🔍 BM25 Debug - Found ${twoFactorChunks.length} 2FA-related chunks:`);
      twoFactorChunks.forEach(chunk => {
        console.log(`  ${chunk.id}: Score ${chunk.score.toFixed(3)} | "${chunk.content.substring(0, 100)}..."`);
      });
    } else {
      console.log(`🔍 BM25 Debug - No 2FA chunks found in BM25 results`);
    }
    
    return bm25Results;
  }

  /**
   * Apply Reciprocal Rank Fusion (RRF) to combine results
   */
  applyRRFFusion(resultSets, poolSize) {
    const rrfK = 60; // RRF constant
    const scores = new Map();
    
    // Process each result set
    Object.entries(resultSets).forEach(([source, results]) => {
      results.forEach((result, index) => {
        const rrfScore = 1 / (rrfK + index + 1);
        
        if (scores.has(result.id)) {
          const existing = scores.get(result.id);
          existing.rrfScore += rrfScore;
          existing.sources[source] = { rank: index + 1, score: result.score };
          
          // Debug: Track score changes for 2FA chunks
          if (result.id === 'sc_65' || result.id === 's_69') {
            console.log(`🔄 RRF Debug ${result.id}: Adding ${source} - Rank: ${index + 1}, Score: ${result.score}, RRF: ${rrfScore.toFixed(6)}, Total RRF: ${existing.rrfScore.toFixed(6)}`);
          }
        } else {
          const newEntry = {
            ...result,
            rrfScore: rrfScore,
            sources: { [source]: { rank: index + 1, score: result.score } }
          };
          scores.set(result.id, newEntry);
          
          // Debug: Track score changes for 2FA chunks
          if (result.id === 'sc_65' || result.id === 's_69') {
            console.log(`🔄 RRF Debug ${result.id}: New entry from ${source} - Rank: ${index + 1}, Score: ${result.score}, RRF: ${rrfScore.toFixed(6)}, Final Score: ${newEntry.score?.toFixed(3) || 'undefined'}`);
          }
        }
      });
    });
    
    // Sort by RRF score and return top candidates
    const allResults = Array.from(scores.values());
    
    // Set RRF score as the primary score for sorting
    allResults.forEach(result => {
      result.score = result.rrfScore;
    });
    
    const finalResults = allResults
      .sort((a, b) => b.score - a.score)
      .slice(0, poolSize);
    
    // Debug: Check if score field is being modified during sorting
    const twoFactorResults = finalResults.filter(result => 
      result.id === 'sc_65' || result.id === 's_69'
    );
    
    if (twoFactorResults.length > 0) {
      console.log(`🔄 RRF Final Debug - 2FA chunks after sorting:`);
      twoFactorResults.forEach(chunk => {
        const position = finalResults.findIndex(r => r.id === chunk.id) + 1;
        console.log(`  Position ${position}: ${chunk.id} | RRF Score: ${chunk.rrfScore.toFixed(6)} | Score Field: ${chunk.score?.toFixed(3) || 'undefined'} | Original Score: ${chunk.sources?.bm25?.score?.toFixed(3) || 'undefined'}`);
      });
    }
    
    // Debug: Log RRF fusion results for 2FA chunks
    const twoFactorChunks = finalResults.filter(result => 
      result.content.toLowerCase().includes('two-factor') || 
      result.content.toLowerCase().includes('2fa') ||
      result.id === 'sc_65'
    );
    
    if (twoFactorChunks.length > 0) {
      console.log(`🔄 RRF Fusion Debug - Found ${twoFactorChunks.length} 2FA-related chunks in final results:`);
      twoFactorChunks.forEach((chunk, index) => {
        const position = finalResults.findIndex(r => r.id === chunk.id) + 1;
        console.log(`  Position ${position}: ${chunk.id} | RRF Score: ${chunk.rrfScore.toFixed(6)} | Final Score: ${chunk.score?.toFixed(3) || 'undefined'} | Sources:`, chunk.sources);
      });
    } else {
      console.log(`🔄 RRF Fusion Debug - No 2FA chunks found in final RRF results`);
    }
    
    // Debug: Check if there's any score transformation happening
    console.log(`🔄 RRF Fusion Debug - Sample of final results scores:`);
    finalResults.slice(0, 10).forEach((chunk, i) => {
      console.log(`  ${i + 1}. ${chunk.id}: RRF=${chunk.rrfScore.toFixed(6)}, Final=${chunk.score?.toFixed(3) || 'undefined'}`);
    });
    
    return finalResults;
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

  async exactPhraseSearch(query, limit) {
    const chunks = this.documentProcessor.getChunks();
    const results = [];
    
    // Extract phrases from query (backticks, quotes, or multi-word terms)
    const phrases = this.extractPhrases(query);
    console.log(`🎯 Exact Phrase Debug - Extracted phrases: [${phrases.join(', ')}]`);
    
    for (const chunk of chunks) {
      let maxScore = 0;
      let matchedPhrase = '';
      
      // Check each exact phrase
      phrases.forEach(phrase => {
        if (chunk.content.toLowerCase().includes(phrase.toLowerCase())) {
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
          // keep a small constant so it blends with other sources
          score: 1.0,                 // <- was words*10; now a tiny base
          exactScore: maxScore,       // keep detail for debugging if you want
          matchedPhrase: matchedPhrase,
          source: 'exact'
        });
      }
    }
    
    const exactResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
    
    // Debug: Log exact phrase results for 2FA chunks
    const twoFactorChunks = exactResults.filter(result => 
      result.content.toLowerCase().includes('two-factor') || 
      result.content.toLowerCase().includes('2fa') ||
      result.id === 'sc_65'
    );
    
    if (twoFactorChunks.length > 0) {
      console.log(`🎯 Exact Phrase Debug - Found ${twoFactorChunks.length} 2FA-related chunks:`);
      twoFactorChunks.forEach(chunk => {
        console.log(`  ${chunk.id}: Score ${chunk.score.toFixed(3)} | ExactScore ${chunk.exactScore} | Matched: "${chunk.matchedPhrase}" | "${chunk.content.substring(0, 100)}..."`);
      });
    } else {
      console.log(`🎯 Exact Phrase Debug - No 2FA chunks found in exact phrase results`);
    }
    
    return exactResults;
  }

  /**
   * Extract phrases from query (backticks, quotes, or important terms)
   */
  extractPhrases(query) {
    const phrases = [];
    
    // Extract backtick phrases
    const backtickMatches = query.match(/`([^`]+)`/g);
    if (backtickMatches) {
      phrases.push(...backtickMatches.map(match => match.slice(1, -1)));
    }
    
    // Extract quoted phrases
    const quoteMatches = query.match(/"([^"]+)"/g);
    if (quoteMatches) {
      phrases.push(...quoteMatches.map(match => match.slice(1, -1)));
    }
    
    // Extract important multi-word terms (3+ words)
    const words = query.split(/\s+/);
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      if (phrase.length > 10) { // Only meaningful phrases
        phrases.push(phrase);
      }
    }
    
    return [...new Set(phrases)]; // Remove duplicates
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
      const semanticResults = similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      // Debug: Log semantic results for 2FA chunks
      const twoFactorChunks = semanticResults.filter(result => 
        result.content.toLowerCase().includes('two-factor') || 
        result.content.toLowerCase().includes('2fa') ||
        result.id === 'sc_65'
      );
      
      if (twoFactorChunks.length > 0) {
        console.log(`🧠 Semantic Debug - Found ${twoFactorChunks.length} 2FA-related chunks:`);
        twoFactorChunks.forEach(chunk => {
          console.log(`  ${chunk.id}: Score ${chunk.score.toFixed(3)} | "${chunk.content.substring(0, 100)}..."`);
        });
      } else {
        console.log(`🧠 Semantic Debug - No 2FA chunks found in semantic results`);
      }
      
      return semanticResults;

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

  applyTokenBucketFiltering(results, queryAnalysis) {
    const filteredResults = [];
    
    for (const result of results) {
      // Check if chunk matches token buckets
      const bucketMatch = this.queryAnalyzer.matchesTokenBuckets(result, queryAnalysis.tokenBuckets);
      
      if (bucketMatch.matches) {
        // Boost score based on token bucket matches
        const bucketBoost = bucketMatch.score * 0.3; // 30% boost for token matches
        result.bucketScore = bucketMatch.score;
        result.bucketMatches = bucketMatch;
        result.originalScore = result.score;
        result.score = result.score + bucketBoost;
        
        filteredResults.push(result);
      }
    }
    
    // Sort by combined score (original + bucket boost)
    filteredResults.sort((a, b) => b.score - a.score);
    
    logger.info(`Token bucket filtering: ${filteredResults.length}/${results.length} chunks passed`);
    return filteredResults;
  }
}

module.exports = { SearchService };
