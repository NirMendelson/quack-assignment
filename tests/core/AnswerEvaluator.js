import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

class AnswerEvaluator {
  constructor() {
    // Check both possible environment variable names
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
    
    if (!apiKey) {
      throw new Error('Missing Anthropic API key. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable');
    }

    // Use a valid Anthropic model id for the Vercel AI adapter
    this.model = anthropic('claude-sonnet-4-20250514', { apiKey });
  }

  async evaluateAnswerWithLLM(expected, actual, question) {
    // Use Claude to evaluate if the generated answer matches the expected answer
    try {
      const prompt = `You are an expert evaluator for policy Q&A systems. Your task is to determine if the actual answer correctly addresses the question and matches the expected answer.

EVALUATION CRITERIA:
1. Semantic Equivalence: The actual answer should convey the same meaning as the expected answer
2. Completeness: The actual answer should cover the key information from the expected answer
3. Accuracy: The actual answer should be factually correct
4. Format Tolerance: Different wording, punctuation, or formatting should not affect correctness
5. Context Awareness: These responses are ALL EQUIVALENT when indicating no data is available:
   - "No data about it in the text"
   - "I could not find this in the policy"
   - "Transferring to human customer support"
   - "I could not find this information"
   - Any response indicating the information is not available in the policy

QUESTION: ${question}

EXPECTED ANSWER: ${expected}

ACTUAL ANSWER: ${actual}

Please evaluate if the actual answer is correct. Consider:
- Are the key facts the same?
- Is the meaning equivalent?
- Are both answers saying the same thing in different words?
- If both indicate "no data available" in any form, they are equivalent

Respond with ONLY "CORRECT" or "INCORRECT" followed by a brief explanation.`;

      const response = await generateText({
        model: this.model,
        maxTokens: 100,
        temperature: 0,
        prompt: `You are an expert evaluator for policy Q&A systems. Be fair and consider semantic equivalence.\n\n${prompt}`
      });

      const evaluation = response.text.trim();
      const isCorrect = evaluation.startsWith('CORRECT');
      
      return isCorrect;

    } catch (error) {
      console.log(`    Evaluation error: ${error.message}`);
      // Fallback to simple keyword matching if LLM fails
      return this.evaluateAnswerFallback(expected, actual);
    }
  }

  evaluateAnswerFallback(expected, actual) {
    // Fallback evaluation using simple keyword matching when LLM evaluation fails
    const expectedKeywords = this.extractKeywords(expected.toLowerCase());
    const actualKeywords = this.extractKeywords(actual.toLowerCase());
    
    // Check if key information is present
    const keyInfoPresent = expectedKeywords.some(keyword => 
      actualKeywords.some(actualKeyword => 
        actualKeyword.includes(keyword) || keyword.includes(actualKeyword)
      )
    );
    
    // Check for contradictory information
    const contradictory = this.checkContradiction(expected, actual);
    
    return keyInfoPresent && !contradictory;
  }

  extractKeywords(text) {
    // Extract meaningful keywords from text for matching
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .map(word => word.toLowerCase());
  }

  checkContradiction(expected, actual) {
    // Check for contradictory information between expected and actual answers
    const contradictions = [
      ['yes', 'no'],
      ['can', 'cannot'],
      ['allowed', 'not allowed'],
      ['available', 'not available'],
      ['possible', 'not possible']
    ];
    
    for (const [pos, neg] of contradictions) {
      const expectedHasPos = expected.toLowerCase().includes(pos);
      const actualHasNeg = actual.toLowerCase().includes(neg);
      const expectedHasNeg = expected.toLowerCase().includes(neg);
      const actualHasPos = actual.toLowerCase().includes(pos);
      
      if ((expectedHasPos && actualHasNeg) || (expectedHasNeg && actualHasPos)) {
        return true;
      }
    }
    
    return false;
  }
}

export { AnswerEvaluator };
