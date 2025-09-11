class QuestionProcessor {
  constructor(searchService, answerService) {
    this.searchService = searchService;
    this.answerService = answerService;
  }

  async testQuestion(question, testDir, questionNumber) {
    // Test a single question by searching, generating answer, and evaluating correctness
    console.log(`\n🔍 Q${questionNumber}: "${question.question}"`);
    console.log(`📝 Expected: "${question.expectedAnswer}"`);
    
    // Search for relevant content using the search service
    const searchResults = await this.searchService.search(question.question, 20);
    
    // Find which chunks contain the expected answer
    const answerChunks = this.findAllAnswerChunks(question.expectedAnswer, searchResults);
    const answerChunk = answerChunks.length > 0 ? answerChunks[0] : null;
    
    // Show top 20 chunks and score calculations
    this.explainRatingCalculation(searchResults, answerChunk, answerChunks);
    
    if (searchResults.length === 0) {
      console.log(`❌ No search results found`);
      return {
        testDir,
        questionNumber,
        question: question.question,
        expectedAnswer: question.expectedAnswer,
        actualAnswer: "I could not find this in the policy.",
        isCorrect: false,
        confidence: 0,
        searchResults: 0
      };
    }

    // Generate answer using the search results
    const answer = await this.answerService.generateAnswer(question.question, searchResults);
    console.log(`🤖 Generated: "${answer.text}"`);
    console.log(`🎯 Confidence: ${(answer.confidence * 100).toFixed(1)}%`);
    
    // Clean up citations from the answer text
    const cleanAnswer = this.cleanAnswerText(answer.text);
    
    // Evaluate correctness using LLM
    const isCorrect = await this.evaluateAnswerWithLLM(question.expectedAnswer, cleanAnswer, question.question);
    console.log(`⚖️ Evaluation: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
    
    return {
      testDir,
      questionNumber,
      question: question.question,
      expectedAnswer: question.expectedAnswer,
      actualAnswer: cleanAnswer,
      isCorrect,
      confidence: answer.confidence,
      searchResults: searchResults.length,
      citations: answer.citations?.length || 0
    };
  }

  findAllAnswerChunks(expectedAnswer, chunks) {
    // First, try to find the exact quoted text from the Q&A file
    const quotedText = this.extractQuotedText(expectedAnswer);
    if (quotedText) {
      const exactMatches = this.findChunksWithText(chunks, quotedText);
      if (exactMatches.length > 0) {
        return exactMatches; // Return all exact matches
      }
      
      // If no exact match, try half-quotes
      const halfQuotes = this.splitIntoHalves(quotedText);
      for (const half of halfQuotes) {
        const halfMatches = this.findChunksWithText(chunks, half);
        if (halfMatches.length > 0) {
          return halfMatches; // Return all half-matches
        }
      }
    }
    
    // Fallback to keyword matching
    const answerKeywords = this.extractKeywords(expectedAnswer.toLowerCase());
    const keywordMatches = [];
    
    for (const chunk of chunks) {
      const chunkText = chunk.content.toLowerCase();
      const matches = answerKeywords.filter(keyword => 
        chunkText.includes(keyword)
      );
      
      // If we find at least 50% of the keywords, consider this chunk as containing the answer
      if (matches.length >= Math.ceil(answerKeywords.length * 0.5)) {
        keywordMatches.push(chunk);
      }
    }
    
    return keywordMatches;
  }

  findAnswerInChunks(expectedAnswer, chunks) {
    const answerChunks = this.findAllAnswerChunks(expectedAnswer, chunks);
    return answerChunks.length > 0 ? answerChunks[0] : null;
  }

  extractQuotedText(expectedAnswer) {
    // Look for text in quotes or backticks in the expected answer
    const quoteMatch = expectedAnswer.match(/> \*"([^"]+)"\*/);
    if (quoteMatch) {
      return quoteMatch[1].trim();
    }
    
    // Look for text in backticks
    const backtickMatch = expectedAnswer.match(/`([^`]+)`/);
    if (backtickMatch) {
      return backtickMatch[1].trim();
    }
    
    return null;
  }

  splitIntoHalves(text) {
    const words = text.split(/\s+/);
    const midPoint = Math.floor(words.length / 2);
    
    return [
      words.slice(0, midPoint).join(' '),
      words.slice(midPoint).join(' ')
    ];
  }

  findChunksWithText(chunks, searchText) {
    const normalizedSearchText = searchText.toLowerCase().replace(/\*\*/g, '').trim();
    
    return chunks.filter(chunk => {
      const normalizedChunkText = chunk.content.toLowerCase().replace(/\*\*/g, '').trim();
      return normalizedChunkText.includes(normalizedSearchText);
    });
  }

  explainRatingCalculation(searchResults, answerChunk, answerChunks) {
    // Show top 20 chunks and score calculations
    console.log(`\n📊 TOP 20 CHUNKS:`);
    searchResults.slice(0, 20).forEach((chunk, index) => {
      const isAnswerChunk = answerChunks && answerChunks.some(ac => ac.id === chunk.id);
      const marker = isAnswerChunk ? '🎯' : '  ';
      console.log(`${marker} ${index + 1}. [${chunk.type}] ${chunk.id} | Score: ${chunk.score.toFixed(6)} | "${chunk.content.substring(0, 80)}..."`);
    });
    
    if (answerChunks && answerChunks.length > 0) {
      console.log(`\n🎯 ANSWER FOUND in ${answerChunks.length} chunk(s):`);
      answerChunks.forEach((chunk, index) => {
        const position = searchResults.findIndex(r => r.id === chunk.id) + 1;
        console.log(`  ${index + 1}. [${chunk.type}] ${chunk.id} at position ${position}`);
      });
    } else {
      console.log(`\n❌ No answer chunks found in top 20 results`);
    }
    
    // Show detailed calculations for top chunk that contains the answer
    if (answerChunks && answerChunks.length > 0) {
      const topAnswerChunk = answerChunks[0];
      const answerRank = searchResults.findIndex(r => r.id === topAnswerChunk.id) + 1;
      console.log(`\n🎯 TOP ANSWER CHUNK CALCULATION (${topAnswerChunk.id}):`);
      
      if (topAnswerChunk.sources) {
        Object.entries(topAnswerChunk.sources).forEach(([source, data]) => {
          const rrfK = 60;
          const rrfScore = 1 / (rrfK + data.rank);
          console.log(`  - ${source}: score ${data.score.toFixed(3)}, rank ${data.rank} → RRF ${rrfScore.toFixed(6)}`);
        });
        
        const totalRrf = Object.values(topAnswerChunk.sources).reduce((sum, data) => {
          const rrfK = 60;
          return sum + (1 / (rrfK + data.rank));
        }, 0);
        
        if (topAnswerChunk.exactPhraseBonus) {
          console.log(`  - Final: ${totalRrf.toFixed(6)} + ${topAnswerChunk.exactPhraseBonus.toFixed(6)} = ${topAnswerChunk.score.toFixed(6)} (total rank ${answerRank})`);
        } else {
          console.log(`  - Final RRF Score: ${topAnswerChunk.score.toFixed(6)} (total rank ${answerRank})`);
        }
      }
    }
    
    // Show detailed calculations for top chunk that doesn't contain the answer
    if (searchResults.length > 0) {
      const topNonAnswerChunk = searchResults.find(chunk => 
        !answerChunks || !answerChunks.some(ac => ac.id === chunk.id)
      );
      
      if (topNonAnswerChunk) {
        const nonAnswerRank = searchResults.findIndex(r => r.id === topNonAnswerChunk.id) + 1;
        console.log(`\n📊 TOP NON-ANSWER CHUNK CALCULATION (${topNonAnswerChunk.id}):`);
        
        if (topNonAnswerChunk.sources) {
          Object.entries(topNonAnswerChunk.sources).forEach(([source, data]) => {
            const rrfK = 60;
            const rrfScore = 1 / (rrfK + data.rank);
            console.log(`  - ${source}: score ${data.score.toFixed(3)}, rank ${data.rank} → RRF ${rrfScore.toFixed(6)}`);
          });
          
          const totalRrf = Object.values(topNonAnswerChunk.sources).reduce((sum, data) => {
            const rrfK = 60;
            return sum + (1 / (rrfK + data.rank));
          }, 0);
          
          if (topNonAnswerChunk.exactPhraseBonus) {
            console.log(`  - Final: ${totalRrf.toFixed(6)} + ${topNonAnswerChunk.exactPhraseBonus.toFixed(6)} = ${topNonAnswerChunk.score.toFixed(6)} (total rank ${nonAnswerRank})`);
          } else {
            console.log(`  - Final RRF Score: ${topNonAnswerChunk.score.toFixed(6)} (total rank ${nonAnswerRank})`);
          }
        }
      }
    }
  }

  parseQAFile(content) {
    // Parse the Q&A markdown file to extract questions and expected answers
    const questions = [];
    const lines = content.split('\n');
    let currentQuestion = null;
    let currentAnswer = null;
    let inAnswer = false;
    let inComment = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check for comment start/end
      if (trimmed.includes('<!--')) {
        inComment = true;
      }
      if (trimmed.includes('-->')) {
        inComment = false;
        continue; // Skip the rest of this line
      }
      
      // Skip if we're inside a comment
      if (inComment) {
        continue;
      }
      
      if (trimmed.startsWith('### Q')) {
        // Save previous question if exists
        if (currentQuestion && currentAnswer) {
          questions.push({
            question: currentQuestion,
            expectedAnswer: currentAnswer
          });
        }
        
        // Start new question
        currentQuestion = trimmed.replace(/^### Q\d+\.\s*/, '');
        currentAnswer = '';
        inAnswer = false;
      } else if (trimmed.startsWith('**A:**')) {
        inAnswer = true;
        currentAnswer = trimmed.replace('**A:**', '').trim();
      } else if (inAnswer && trimmed && !trimmed.startsWith('>') && !trimmed.startsWith('---')) {
        currentAnswer += ' ' + trimmed;
      }
    }

    // Add the last question
    if (currentQuestion && currentAnswer) {
      questions.push({
        question: currentQuestion,
        expectedAnswer: currentAnswer
      });
    }

    return questions;
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

      const response = await this.answerService.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `You are an expert evaluator for policy Q&A systems. Be fair and consider semantic equivalence.\n\n${prompt}`
          }
        ]
      });

      const evaluation = response.content[0].text.trim();
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

  cleanAnswerText(text) {
    // Remove citation patterns and formatting from the generated answer
    return text.replace(/\[c:\d+\s*->[^\]]+\]/g, '')
      // Remove bold markers around quoted text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // Clean up extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = { QuestionProcessor };
