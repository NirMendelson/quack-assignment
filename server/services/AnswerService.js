const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

class AnswerService {
  constructor() {
    this.cohereApiKey = process.env.COHERE_API_KEY;
    this.claude = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async generateAnswer(question, searchResults) {
    try {
      console.log(`🤖 Generating answer for: "${question}"`);
      logger.info(`Generating answer for question: ${question}`);

      // Skip reranking - use original search results directly
      console.log(`📊 Using original search results (reranking disabled)...`);
      const topChunks = searchResults.slice(0, 5);
      console.log(`📊 Selected top ${topChunks.length} chunks for evidence check`);
      
      // Check if we have sufficient evidence
      console.log(`🔍 Checking if evidence is sufficient...`);
      const hasEvidence = this.hasSufficientEvidence(topChunks);
      
      if (!hasEvidence) {
        console.log(`❌ Insufficient evidence - returning "I could not find this in the policy."`);
        return {
          text: "I could not find this in the policy.",
          citations: [],
          confidence: 0,
          chunks: topChunks
        };
      }
      
      // Generate answer using Claude Sonnet 3
      console.log(`✅ Sufficient evidence found - generating answer with Claude...`);
      const answer = await this.generateAnswerWithClaude(question, topChunks);
      
      console.log(`📝 Generated answer: "${answer.text}"`);
      logger.info('Answer generated successfully');
      return answer;

    } catch (error) {
      console.log(`❌ Error generating answer: ${error.message}`);
      logger.error('Error generating answer:', error.message);
      throw error;
    }
  }

  async rerankResults(question, searchResults) {
    try {
      if (searchResults.length === 0) {
        return [];
      }

      // Prepare documents for reranking
      const documents = searchResults.map(result => ({
        text: result.content,
        id: result.id
      }));

      // Use Cohere Rerank via REST API
      const rerankResponse = await axios.post('https://api.cohere.ai/v1/rerank', {
        model: 'rerank-english-v3.0',
        query: question,
        documents: documents.map(doc => doc.text),
        top_n: Math.min(5, documents.length)
      }, {
        headers: {
          'Authorization': `Bearer ${this.cohereApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      // Map reranked results back to original format
      const rerankedResults = rerankResponse.data.results.map((result, index) => {
        const originalResult = searchResults.find(r => r.id === documents[result.index].id);
        return {
          ...originalResult,
          rerankScore: result.relevance_score,
          score: result.relevance_score // Use rerank score as final score
        };
      });

      logger.info(`Reranked ${searchResults.length} results to ${rerankedResults.length} top results`);
      return rerankedResults;

    } catch (error) {
      logger.error('Error reranking results:', error.message);
      // Fallback to original results if reranking fails
      return searchResults.slice(0, 5);
    }
  }

  hasSufficientEvidence(chunks) {
    console.log(`🔍 Checking evidence sufficiency for ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      console.log(`❌ No chunks provided`);
      return false;
    }

    // Check if any chunk has a reasonable score
    const hasGoodScore = chunks.some(chunk => chunk.score > 0.3);
    console.log(`📊 Has good score (>0.3): ${hasGoodScore}`);
    
    // Log chunk scores
    chunks.forEach((chunk, index) => {
      console.log(`  Chunk ${chunk.id}: Score ${chunk.score.toFixed(3)} | "${chunk.content.substring(0, 80)}..."`);
    });
    
    // Check if chunks contain relevant content
    const hasRelevantContent = chunks.some(chunk => 
      chunk.content && chunk.content.length > 20
    );
    console.log(`🔍 Has relevant content: ${hasRelevantContent}`);

    const sufficient = hasGoodScore && hasRelevantContent;
    console.log(`✅ Evidence sufficient: ${sufficient}`);
    return sufficient;
  }

  async generateAnswerWithClaude(question, chunks) {
    try {
      // Prepare context from chunks
      const context = chunks.map((chunk, index) => 
        `[Chunk ${index + 1}] ${chunk.content}`
      ).join('\n\n');

      // Create citations
      const citations = chunks.map((chunk, index) => ({
        id: chunk.id,
        section: chunk.section,
        chunkIndex: index + 1
      }));

      const prompt = `Answer the user's question using ONLY the information from the provided excerpts.

CRITICAL RULES - NO EXCEPTIONS:
1. ONLY use information that is explicitly stated in the provided excerpts
2. DO NOT use any information from your training data or general knowledge
3. DO NOT make assumptions or inferences beyond what is directly stated
4. If information is not in the provided excerpts, respond with this exact phrase: "Transferring to human customer support."
5. Answer in your own words - do NOT quote the exact text from the excerpts
6. Answer straight and to the point, do not add any extra information.
7. Be precise and factual
8. Write naturally and avoid extra spaces before punctuation
9. Start your answer directly - do NOT use phrases like "Based on the policy document" or "According to the policy"
10. DO NOT include any citation references like [c:chunk_1 -> section] in your answer

Question: ${question}

Policy Excerpts:
${context}

Answer:`;

      const response = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        temperature: 0, // Deterministic responses
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      let answerText = response.content[0].text.trim();
      
      // Clean up spacing issues
      answerText = answerText
        .replace(/\s+\./g, '.')  // Remove spaces before periods
        .replace(/\s+,/g, ',')   // Remove spaces before commas
        .replace(/\s+;/g, ';')   // Remove spaces before semicolons
        .replace(/\s+:/g, ':')   // Remove spaces before colons
        .replace(/\s+!/g, '!')   // Remove spaces before exclamation marks
        .replace(/\s+\?/g, '?')  // Remove spaces before question marks
        .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
        .trim();
      
      // Calculate confidence based on chunk scores
      const avgScore = chunks.reduce((sum, chunk) => sum + chunk.score, 0) / chunks.length;
      const confidence = Math.min(avgScore * 2, 1); // Scale to 0-1

      return {
        text: answerText,
        citations: citations,
        confidence: confidence,
        chunks: chunks
      };

    } catch (error) {
      logger.error('Error generating answer with Claude:', error.message);
      throw error;
    }
  }
}

module.exports = { AnswerService };
