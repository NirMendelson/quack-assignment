import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { logger } from '../utils/logger.js';

class AnswerService {
  constructor() {
    // Check both possible environment variable names
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
    
    if (!apiKey) {
      throw new Error('Missing Anthropic API key. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable');
    }

    // Use a valid Anthropic model id for the Vercel AI adapter
    this.model = anthropic('claude-sonnet-4-20250514', { apiKey });
  }

  async generateAnswer(question, searchResults) {
    try {
      console.log(`🤖 Generating answer for: "${question}"`);
      logger.info(`Generating answer for question: ${question}`);

      // Use top 5 search results directly (no reranking needed)
      const topChunks = searchResults.slice(0, 5);
      
      // Generate answer using Claude
      const answer = await this.generateAnswerWithClaude(question, topChunks);
      
      logger.info('Answer generated successfully');
      return answer;

    } catch (error) {
      console.log(`❌ Error generating answer: ${error.message}`);
      logger.error('Error generating answer:', error.message);
      throw error;
    }
  }

  /**
   * Detect if query is spec-style (contains code-like terms)
   */
  isSpecQuery(question) {
    const specPatterns = [
      /`[^`]+`/,  // Backticks
      /\.\w+/,    // Dotted notation
      /[A-Z][a-z]+[A-Z]/,  // camelCase
      /[a-z]+_[a-z]+/,     // snake_case
      /revisionHistoryLimit|spec\.|\.spec/  // Specific terms
    ];
    
    return specPatterns.some(pattern => pattern.test(question));
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
3. **Be concise but complete:**
   - Give straight answers without extra details the customer didn't ask for
   - Keep all relevant data that the customer asked about
   - If possible, answer under 25 words
   - If the answer contains a lot of details, try to keep it under 40 words
   - Focus only on what was specifically asked - avoid adding background info or step-by-step processes
4. DO NOT make assumptions or inferences beyond what is directly stated
5. If the information needed to answer the question is NOT explicitly stated in the provided excerpts, respond with ONLY this exact phrase: "Transferring to human customer support."
6. DO NOT provide incomplete or speculative answers - if key information is missing, say "Transferring to human customer support."
7. DO NOT say things like "The document only discusses..." or "There is no mention of..." - just say "Transferring to human customer support."
8. Answer in your own words - do NOT quote the exact text from the excerpts
9. Be precise and factual
10. Write naturally and avoid extra spaces before punctuation
11. Start your answer directly - do NOT use phrases like "Based on the policy document" or "According to the policy"
12. DO NOT include any citation references like [c:chunk_1 -> section] in your answer

Question: ${question}

Policy Excerpts:
${context}

Answer:`;

      const response = await generateText({
        model: this.model,
        maxTokens: 500,
        temperature: 0, // Deterministic responses
        prompt: prompt
      });

      let answerText = response.text.trim();
      
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
      logger.error('Error generating answer with Claude via Vercel AI SDK:', {
        name: error.name,
        message: error.message,
        status: error.status,
        cause: error.cause ? String(error.cause) : undefined,
        data: error.data ? '[present]' : '[none]',
      });
      throw error;
    }
  }
}

export { AnswerService };
