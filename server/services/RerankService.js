const axios = require('axios');
const { logger } = require('../utils/logger');

class RerankService {
  constructor(cohereApiKey, voyageApiKey) {
    this.cohereApiKey = cohereApiKey;
    this.voyageApiKey = voyageApiKey;
    this.rrfK = 60; // RRF constant
    this.maxWindowChunkShare = 0.5; // Max 50% window chunks in candidate pool
    this.minLiteralHits = 10; // Guarantee at least 10 literal-hit chunks
    this.truncationLength = 900; // Chars around hit span
  }

  /**
   * Extract key terms from query for evidence gate
   */
  extractKeyTerms(query) {
    // Extract code-like terms (backticks, dots, camelCase, snake_case)
    const codeTerms = query.match(/`([^`]+)`|\.([a-zA-Z_][a-zA-Z0-9_.]*)|([a-zA-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)|([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    
    // Extract quoted terms
    const quotedTerms = query.match(/"([^"]+)"/g) || [];
    
    // Extract important words (longer than 3 chars, not common words)
    const commonWords = new Set(['the', 'and', 'or', 'but', 'for', 'with', 'from', 'what', 'when', 'where', 'how', 'why', 'does', 'are', 'is', 'was', 'were', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'have', 'has', 'had', 'been', 'being', 'do', 'did', 'does', 'done', 'get', 'got', 'give', 'gave', 'make', 'made', 'take', 'took', 'come', 'came', 'go', 'went', 'see', 'saw', 'know', 'knew', 'think', 'thought', 'say', 'said', 'tell', 'told', 'want', 'wanted', 'need', 'needed', 'use', 'used', 'work', 'worked', 'call', 'called', 'try', 'tried', 'ask', 'asked', 'turn', 'turned', 'move', 'moved', 'play', 'played', 'run', 'ran', 'walk', 'walked', 'live', 'lived', 'look', 'looked', 'help', 'helped', 'show', 'showed', 'hear', 'heard', 'feel', 'felt', 'seem', 'seemed', 'leave', 'left', 'put', 'put', 'bring', 'brought', 'begin', 'began', 'keep', 'kept', 'let', 'let', 'start', 'started', 'write', 'wrote', 'provide', 'provided', 'find', 'found', 'give', 'gave', 'tell', 'told', 'become', 'became', 'leave', 'left', 'feel', 'felt', 'put', 'put', 'bring', 'brought', 'begin', 'began', 'keep', 'kept', 'let', 'let', 'start', 'started', 'write', 'wrote', 'provide', 'provided', 'find', 'found']);
    const words = query.toLowerCase().split(/\s+/).filter(word => 
      word.length > 3 && !commonWords.has(word) && /^[a-zA-Z]+$/.test(word)
    );
    
    return [...codeTerms, ...quotedTerms, ...words];
  }

  /**
   * Check if chunk contains literal terms (robust matching)
   */
  containsLiteral(chunkText, terms) {
    const normalizedText = chunkText.toLowerCase();
    
    for (const term of terms) {
      const cleanTerm = term.replace(/[`"]/g, '').toLowerCase();
      
      // 1. Exact match (case-insensitive)
      if (normalizedText.includes(cleanTerm)) return true;
      
      // 2. Punctuation-insensitive match
      const noPunctTerm = cleanTerm.replace(/[^\w]/g, '');
      const noPunctText = normalizedText.replace(/[^\w]/g, '');
      if (noPunctText.includes(noPunctTerm)) return true;
      
      // 3. De-camel match (camelCase -> space separated)
      const deCamelTerm = cleanTerm.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
      if (normalizedText.includes(deCamelTerm)) return true;
      
      // 4. Snake_case -> space separated
      const deSnakeTerm = cleanTerm.replace(/_/g, ' ');
      if (normalizedText.includes(deSnakeTerm)) return true;
    }
    
    return false;
  }

  /**
   * Truncate chunk around best hit span
   */
  truncateAroundHit(chunkText, terms) {
    if (chunkText.length <= this.truncationLength) return chunkText;
    
    const normalizedText = chunkText.toLowerCase();
    let bestHitIndex = -1;
    let bestHitLength = 0;
    
    // Find the best hit span
    for (const term of terms) {
      const cleanTerm = term.replace(/[`"]/g, '').toLowerCase();
      const index = normalizedText.indexOf(cleanTerm);
      if (index !== -1 && cleanTerm.length > bestHitLength) {
        bestHitIndex = index;
        bestHitLength = cleanTerm.length;
      }
    }
    
    if (bestHitIndex === -1) {
      // No hit found, return beginning
      return chunkText.substring(0, this.truncationLength);
    }
    
    // Center around hit with padding
    const halfLength = Math.floor(this.truncationLength / 2);
    const start = Math.max(0, bestHitIndex - halfLength);
    const end = Math.min(chunkText.length, start + this.truncationLength);
    
    // Adjust to avoid cutting sentences
    let finalStart = start;
    let finalEnd = end;
    
    // Look for sentence boundaries
    if (start > 0) {
      const sentenceStart = chunkText.lastIndexOf('.', start);
      if (sentenceStart > start - 100) finalStart = sentenceStart + 1;
    }
    
    if (end < chunkText.length) {
      const sentenceEnd = chunkText.indexOf('.', end);
      if (sentenceEnd < end + 100) finalEnd = sentenceEnd + 1;
    }
    
    return chunkText.substring(finalStart, finalEnd).trim();
  }

  /**
   * Deduplicate chunks by normalized content and location
   */
  deduplicateChunks(chunks) {
    const seen = new Map();
    const deduped = [];
    
    for (const chunk of chunks) {
      const normalized = chunk.content.toLowerCase().replace(/\s+/g, ' ').trim();
      const location = `${chunk.type}_${chunk.section || 'unknown'}`;
      const key = `${normalized}_${location}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        deduped.push(chunk);
      }
    }
    
    return deduped;
  }

  /**
   * Apply diversity constraints to candidate pool
   */
  applyDiversityConstraints(candidates, literalHits) {
    const byType = { window: [], sentence_window: [], sentence_context: [], sentence: [] };
    
    // Group by type
    for (const chunk of candidates) {
      byType[chunk.type] = byType[chunk.type] || [];
      byType[chunk.type].push(chunk);
    }
    
    const result = [];
    const maxWindow = Math.floor(candidates.length * this.maxWindowChunkShare);
    
    // Add literal hits first (guaranteed)
    for (const hit of literalHits.slice(0, this.minLiteralHits)) {
      if (!result.some(c => c.id === hit.id)) {
        result.push(hit);
      }
    }
    
    // Add window chunks (up to limit)
    let windowCount = 0;
    for (const chunk of byType.window) {
      if (windowCount >= maxWindow && !literalHits.some(h => h.id === chunk.id)) continue;
      if (!result.some(c => c.id === chunk.id)) {
        result.push(chunk);
        windowCount++;
      }
    }
    
    // Add other types
    for (const type of ['sentence_window', 'sentence_context', 'sentence']) {
      for (const chunk of byType[type]) {
        if (!result.some(c => c.id === chunk.id)) {
          result.push(chunk);
        }
      }
    }
    
    return result.slice(0, 100); // Cap at 100
  }

  /**
   * Rerank chunks using Cohere API
   */
  async rerankWithCohere(query, chunks) {
    try {
      const texts = chunks.map(chunk => chunk.truncatedContent || chunk.content);
      
      const response = await axios.post('https://api.cohere.ai/v1/rerank', {
        model: 'rerank-english-v3.0',
        query: query,
        documents: texts,
        top_k: Math.min(10, chunks.length)
      }, {
        headers: {
          'Authorization': `Bearer ${this.cohereApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const rerankedChunks = response.data.results.map(result => {
        const chunk = chunks[result.index];
        let rerankScore = result.relevance_score;
        
        // Boost score for exact matches of quoted terms from the query
        const content = chunk.truncatedContent || chunk.content;
        const quotedTerms = query.match(/`([^`]+)`/g) || [];
        
        if (quotedTerms.length > 0) {
          // Look for exact matches of quoted terms in the content
          for (const quotedTerm of quotedTerms) {
            const cleanTerm = quotedTerm.replace(/`/g, '');
            if (content.includes(quotedTerm)) {
              rerankScore += 0.1; // Boost for exact quoted term match
            }
            // Also check for variations (with/without quotes)
            if (content.includes(`'${cleanTerm}'`) || content.includes(`"${cleanTerm}"`)) {
              rerankScore += 0.05; // Smaller boost for quoted variations
            }
          }
        }
        
        return {
          ...chunk,
          rerankScore: Math.min(1.0, rerankScore) // Cap at 1.0
        };
      });

      return rerankedChunks;
    } catch (error) {
      logger.error('Cohere rerank error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Evidence gate: check if top-K contains required terms
   */
  checkEvidenceGate(topKChunks, query, isSpecQuery = false) {
    const keyTerms = this.extractKeyTerms(query);
    
    if (keyTerms.length === 0) return { passed: true, reason: 'no_terms' };
    
    const hasKeyTerms = topKChunks.some(chunk => 
      this.containsLiteral(chunk.content, keyTerms)
    );
    
    if (isSpecQuery) {
      // For spec queries, require literal match
      const hasLiteral = topKChunks.some(chunk => 
        this.containsLiteral(chunk.content, keyTerms)
      );
      return { 
        passed: hasLiteral, 
        reason: hasLiteral ? 'literal_match' : 'missing_literal',
        keyTerms 
      };
    } else {
      // For general queries, require at least one key term
      return { 
        passed: hasKeyTerms, 
        reason: hasKeyTerms ? 'key_terms_found' : 'missing_key_terms',
        keyTerms 
      };
    }
  }

  /**
   * Pre-filter chunks to ensure exact matches get priority
   */
  preFilterExactMatches(query, candidates) {
    // Extract quoted terms from query (backticks, quotes)
    const quotedTerms = query.match(/`([^`]+)`|"([^"]+)"/g) || [];
    const cleanQuotedTerms = quotedTerms.map(term => term.replace(/[`"]/g, ''));
    
    // Check if this is a flag-related query
    const isFlagQuery = query.toLowerCase().includes('flag') && 
                       (query.includes('open()') || query.includes('fs.') || query.includes('file'));
    
    console.log(`🔍 Pre-filter: Query: "${query}"`);
    console.log(`🔍 Pre-filter: Is flag query: ${isFlagQuery}`);
    console.log(`🔍 Pre-filter: Extracted quoted terms: [${quotedTerms.join(', ')}]`);
    console.log(`🔍 Pre-filter: Clean terms: [${cleanQuotedTerms.join(', ')}]`);
    
    if (isFlagQuery) {
      // For flag queries, look for chunks containing flag patterns
      const flagPattern = /'[a-z]+\+?'/g;
      const exactMatches = [];
      const remaining = [];
      
      for (const chunk of candidates) {
        const hasFlagPattern = flagPattern.test(chunk.content);
        if (hasFlagPattern) {
          exactMatches.push(chunk);
          console.log(`🎯 Flag pattern found: ${chunk.id} - "${chunk.content.substring(0, 100)}..."`);
        } else {
          remaining.push(chunk);
        }
        // Reset regex lastIndex
        flagPattern.lastIndex = 0;
      }
      
      console.log(`🎯 Pre-filter: Found ${exactMatches.length} flag pattern matches`);
      console.log(`🎯 Pre-filter: ${remaining.length} remaining chunks`);
      
      return { exactMatches, remaining };
    }
    
    // For non-flag queries, use the original logic
    const keyTerms = this.extractKeyTerms(query);
    const allTerms = [...cleanQuotedTerms, ...keyTerms];
    
    console.log(`🔍 Pre-filter: Key terms: [${keyTerms.join(', ')}]`);
    console.log(`🔍 Pre-filter: All terms: [${allTerms.join(', ')}]`);
    
    if (allTerms.length === 0) {
      console.log(`🔍 Pre-filter: No terms found, returning all candidates`);
      return { exactMatches: [], remaining: candidates };
    }
    
    // Find chunks containing exact quoted terms
    const exactMatches = [];
    const remaining = [];
    
    for (const chunk of candidates) {
      const hasExactMatch = allTerms.some(term => {
        // Check for quoted versions
        if (chunk.content.includes(`'${term}'`) || 
            chunk.content.includes(`"${term}"`) ||
            chunk.content.includes(`\`${term}\``)) {
          return true;
        }
        
        // For function calls like 'open()', also check for unquoted versions
        if (term.includes('()')) {
          const unquotedTerm = term.replace(/[()]/g, '');
          if (chunk.content.includes(unquotedTerm)) {
            return true;
          }
        }
        
        // For single words that might be flags, check if they appear as quoted flags
        if (term.length <= 5 && !term.includes('(') && /^[a-zA-Z]+$/.test(term)) {
          if (chunk.content.includes(`'${term}'`)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (hasExactMatch) {
        exactMatches.push(chunk);
        console.log(`🎯 Exact match found: ${chunk.id} - "${chunk.content.substring(0, 100)}..."`);
      } else {
        remaining.push(chunk);
      }
    }
    
    console.log(`🎯 Pre-filter: Found ${exactMatches.length} exact matches for terms: ${cleanQuotedTerms.join(', ')}`);
    console.log(`🎯 Pre-filter: ${remaining.length} remaining chunks`);
    
    // Log some examples of exact matches
    if (exactMatches.length > 0) {
      console.log(`🎯 Top 3 exact matches:`);
      exactMatches.slice(0, 3).forEach((chunk, i) => {
        console.log(`  ${i + 1}. [${chunk.type}] ${chunk.id} - "${chunk.content.substring(0, 150)}..."`);
      });
    }
    
    return { exactMatches, remaining };
  }

  /**
   * Main reranking pipeline
   */
  async rerankChunks(query, searchResults, isSpecQuery = false) {
    try {
      logger.info(`🔄 Starting rerank pipeline for query: "${query}"`);
      
      // Extract key terms
      const keyTerms = this.extractKeyTerms(query);
      logger.info(`📝 Key terms: ${keyTerms.join(', ')}`);
      
      // Deduplicate candidates
      const dedupedCandidates = this.deduplicateChunks(searchResults);
      logger.info(`🔧 Deduplicated: ${searchResults.length} → ${dedupedCandidates.length} chunks`);
      
      // Find literal hits
      const literalHits = dedupedCandidates.filter(chunk => 
        this.containsLiteral(chunk.content, keyTerms)
      );
      logger.info(`🎯 Found ${literalHits.length} literal hits`);
      
      // Apply diversity constraints
      const diverseCandidates = this.applyDiversityConstraints(dedupedCandidates, literalHits);
      logger.info(`🎨 Applied diversity: ${diverseCandidates.length} candidates`);
      
      // Pre-filter for exact matches
      const { exactMatches, remaining } = this.preFilterExactMatches(query, diverseCandidates);
      
      // Truncate chunks around hits
      const truncatedExactMatches = exactMatches.map(chunk => ({
        ...chunk,
        truncatedContent: this.truncateAroundHit(chunk.content, keyTerms)
      }));
      
      const truncatedRemaining = remaining.map(chunk => ({
        ...chunk,
        truncatedContent: this.truncateAroundHit(chunk.content, keyTerms)
      }));
      
      console.log(`🔧 Truncated: ${truncatedExactMatches.length} exact matches, ${truncatedRemaining.length} remaining`);
      
      // Rerank both groups separately
      let rerankedExactMatches = [];
      let rerankedRemaining = [];
      
      if (truncatedExactMatches.length > 0) {
        console.log(`🔄 Reranking ${truncatedExactMatches.length} exact matches with Cohere...`);
        rerankedExactMatches = await this.rerankWithCohere(query, truncatedExactMatches);
        console.log(`🔄 Reranked ${rerankedExactMatches.length} exact matches`);
        
        // Log top exact matches after reranking
        console.log(`🎯 Top exact matches after reranking:`);
        rerankedExactMatches.slice(0, 3).forEach((chunk, i) => {
          console.log(`  ${i + 1}. [${chunk.type}] Score: ${chunk.rerankScore?.toFixed(3)} - "${chunk.content.substring(0, 100)}..."`);
        });
      }
      
      if (truncatedRemaining.length > 0) {
        console.log(`🔄 Reranking ${truncatedRemaining.length} remaining chunks with Cohere...`);
        rerankedRemaining = await this.rerankWithCohere(query, truncatedRemaining);
        console.log(`🔄 Reranked ${rerankedRemaining.length} remaining chunks`);
        
        // Log top remaining matches after reranking
        console.log(`🎯 Top remaining matches after reranking:`);
        rerankedRemaining.slice(0, 3).forEach((chunk, i) => {
          console.log(`  ${i + 1}. [${chunk.type}] Score: ${chunk.rerankScore?.toFixed(3)} - "${chunk.content.substring(0, 100)}..."`);
        });
      }
      
      // Combine results: exact matches first, then remaining
      const allReranked = [...rerankedExactMatches, ...rerankedRemaining];
      
      // Take top 5, ensuring at least 2 exact matches if available
      let topK;
      if (exactMatches.length >= 2) {
        // Take up to 3 exact matches, then fill with remaining
        const exactCount = Math.min(3, rerankedExactMatches.length);
        const remainingCount = Math.min(5 - exactCount, rerankedRemaining.length);
        topK = [
          ...rerankedExactMatches.slice(0, exactCount),
          ...rerankedRemaining.slice(0, remainingCount)
        ];
        console.log(`🎯 Using ${exactCount} exact matches + ${remainingCount} remaining = ${topK.length} total`);
      } else {
        // Take top 5 from combined results
        topK = allReranked.slice(0, 5);
        console.log(`🎯 Using top 5 from combined results (${exactMatches.length} exact matches available)`);
      }
      
      console.log(`🔄 Final top ${topK.length} chunks: ${rerankedExactMatches.length} exact + ${topK.length - rerankedExactMatches.length} remaining`);
      
      // Check evidence gate
      const gateResult = this.checkEvidenceGate(topK, query, isSpecQuery);
      
      // Log detailed results
      logger.info(`🔍 Evidence gate: ${gateResult.passed ? 'PASSED' : 'FAILED'} (${gateResult.reason})`);
      
      for (let i = 0; i < topK.length; i++) {
        const chunk = topK[i];
        const hasLiteral = this.containsLiteral(chunk.content, keyTerms);
        const isExactMatch = exactMatches.some(exact => exact.id === chunk.id);
        logger.info(`  ${i + 1}. [${chunk.type}] Score: ${chunk.rerankScore?.toFixed(3) || 'N/A'} | Literal: ${hasLiteral} | Exact: ${isExactMatch} | ${chunk.content.substring(0, 100)}...`);
      }
      
      return {
        chunks: topK,
        evidenceGate: gateResult,
        literalHits: literalHits.length,
        totalCandidates: diverseCandidates.length,
        exactMatches: exactMatches.length
      };
      
    } catch (error) {
      logger.error('Rerank pipeline error:', error);
      throw error;
    }
  }
}

module.exports = RerankService;
