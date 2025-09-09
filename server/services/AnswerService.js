const axios = require('axios');
const OpenAI = require('openai');
const { logger } = require('../utils/logger');

class AnswerService {
  constructor() {
    this.cohereApiKey = process.env.COHERE_API_KEY;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateAnswer(question, searchResults) {
    try {
      console.log(`🤖 Generating answer for: "${question}"`);
      logger.info(`Generating answer for question: ${question}`);

      // Re-rank results using Cohere
      console.log(`🔄 Reranking ${searchResults.length} search results...`);
      const rerankedResults = await this.rerankResults(question, searchResults);
      
      // Select top 10 most relevant chunks for better coverage
      const topChunks = rerankedResults.slice(0, 10);
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
      
      // Generate answer using GPT-4.1
      console.log(`✅ Sufficient evidence found - generating answer with GPT...`);
      const answer = await this.generateAnswerWithGPT(question, topChunks);
      
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

  async generateAnswerWithGPT(question, chunks) {
    try {
      // Prepare context from chunks
      const context = chunks.map((chunk, index) => 
        `[${index + 1}] ${chunk.content}`
      ).join('\n\n');

      // Create citations
      const citations = chunks.map((chunk, index) => ({
        id: chunk.id,
        section: chunk.section,
        chunkIndex: index + 1
      }));

      const prompt = `You are a policy support agent. Answer the user's question strictly based on the provided policy document excerpts. 

IMPORTANT RULES:
1. Only use information from the provided excerpts
2. Answer in your own words - do NOT quote the exact text from the excerpts
3. Include citations in the format [c:chunk_id -> section_name] for key points
4. If the answer is not clearly found in the excerpts, respond with: "I could not find this in the policy."
5. Be precise and factual
6. If you're unsure, err on the side of saying you couldn't find it
7. Write naturally and avoid extra spaces before punctuation

Question: ${question}

Policy Excerpts:
${context}

Answer:`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-1106-preview', // GPT-4.1
        messages: [
          {
            role: 'system',
            content: 'You are a helpful policy support agent that answers questions based strictly on provided policy documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0, // Deterministic responses
        max_tokens: 500
      });

      let answerText = response.choices[0].message.content.trim();
      
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
      logger.error('Error generating answer with GPT:', error.message);
      throw error;
    }
  }
}

module.exports = { AnswerService };
