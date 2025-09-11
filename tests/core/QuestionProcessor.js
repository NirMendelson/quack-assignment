const { TextProcessor } = require('./TextProcessor');
const { AnswerEvaluator } = require('./AnswerEvaluator');

class QuestionProcessor {
  constructor(searchService, answerService) {
    this.searchService = searchService;
    this.answerService = answerService;
    this.textProcessor = new TextProcessor();
    this.answerEvaluator = new AnswerEvaluator(answerService);
  }

  async testQuestion(question, testDir, questionNumber, qaContent = null) {
    // Test a single question by searching, generating answer, and evaluating correctness
    console.log(`\n🔍 Q${questionNumber}: "${question.question}"`);
    console.log(`📝 Expected: "${question.expectedAnswer}"`);
    if (question.quotedText) {
      console.log(`💬 Quote: "${question.quotedText}"`);
    } else {
      console.log(`💬 Quote: Not found`);
    }
    
    // Search for relevant content using the search service
    const searchResults = await this.searchService.search(question.question, 20);
    
    // Find which chunks contain the expected answer
    const answerChunks = this.findAllAnswerChunks(question.expectedAnswer, searchResults, question.quotedText);
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
    const cleanAnswer = this.textProcessor.cleanAnswerText(answer.text);
    
    // Evaluate correctness using LLM
    const isCorrect = await this.answerEvaluator.evaluateAnswerWithLLM(question.expectedAnswer, cleanAnswer, question.question);
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

  findAllAnswerChunks(expectedAnswer, chunks, quotedText = null) {
    // First, try to find the quoted text (this is what actually exists in chunks)
    if (quotedText) {
      const exactMatches = this.textProcessor.findChunksWithText(chunks, quotedText);
      if (exactMatches.length > 0) {
        return exactMatches;
      }
      
      // Try half-quotes of the quoted text
      const quotedHalves = this.textProcessor.splitIntoHalves(quotedText);
      for (const half of quotedHalves) {
        const halfMatches = this.textProcessor.findChunksWithText(chunks, half);
        if (halfMatches.length > 0) {
          return halfMatches;
        }
      }
    }
    
    // Fallback: try to find the expected answer text directly
    const expectedMatches = this.textProcessor.findChunksWithText(chunks, expectedAnswer);
    if (expectedMatches.length > 0) {
      return expectedMatches;
    }
    
    // Try half-quotes of the expected answer
    const expectedHalves = this.textProcessor.splitIntoHalves(expectedAnswer);
    for (const half of expectedHalves) {
      const halfMatches = this.textProcessor.findChunksWithText(chunks, half);
      if (halfMatches.length > 0) {
        return halfMatches;
      }
    }
    
    // Final fallback to keyword matching
    const answerKeywords = this.textProcessor.extractKeywords(expectedAnswer.toLowerCase());
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
          if (source === 'exact') {
            if (data.bonusApplied !== undefined) {
              console.log(`  - ${source}: bonus ${data.bonusApplied.toFixed(6)}`);
            } else if (data.bonus !== undefined) {
              console.log(`  - ${source}: bonus ${data.bonus.toFixed(6)}`);
            } else {
              console.log(`  - ${source}: data structure:`, data);
            }
          } else if (data.score !== undefined && data.rank !== undefined) {
            const rrfScore = 1 / (rrfK + data.rank);
            console.log(`  - ${source}: score ${data.score.toFixed(3)}, rank ${data.rank} → RRF ${rrfScore.toFixed(6)}`);
          } else {
            console.log(`  - ${source}: data structure:`, data);
          }
        });
        
        const totalRrf = Object.entries(topAnswerChunk.sources).reduce((sum, [source, data]) => {
          const rrfK = 60;
          if (source === 'exact') {
            return sum + (data.bonusApplied || data.bonus || 0);
          } else {
            return sum + (1 / (rrfK + data.rank));
          }
        }, 0);
        
        console.log(`  - Final RRF Score: ${topAnswerChunk.score.toFixed(6)} (total rank ${answerRank})`);
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
            if (source === 'exact') {
              if (data.bonusApplied !== undefined) {
                console.log(`  - ${source}: bonus ${data.bonusApplied.toFixed(6)}`);
              } else if (data.bonus !== undefined) {
                console.log(`  - ${source}: bonus ${data.bonus.toFixed(6)}`);
              } else {
                console.log(`  - ${source}: data structure:`, data);
              }
            } else if (data.score !== undefined && data.rank !== undefined) {
              const rrfScore = 1 / (rrfK + data.rank);
              console.log(`  - ${source}: score ${data.score.toFixed(3)}, rank ${data.rank} → RRF ${rrfScore.toFixed(6)}`);
            } else {
              console.log(`  - ${source}: data structure:`, data);
            }
          });
          
          const totalRrf = Object.entries(topNonAnswerChunk.sources).reduce((sum, [source, data]) => {
            const rrfK = 60;
            if (source === 'exact') {
              return sum + (data.bonusApplied || data.bonus || 0);
            } else {
              return sum + (1 / (rrfK + data.rank));
            }
          }, 0);
          
          console.log(`  - Final RRF Score: ${topNonAnswerChunk.score.toFixed(6)} (total rank ${nonAnswerRank})`);
        }
      }
    }
  }

  parseQAFile(content) {
    const questions = [];
    const lines = content.split('\n');
    let currentQuestion = null;
    let currentAnswer = null;
    let currentQuotedText = null;
    let inAnswer = false;
    let inComment = false;

    for (const rawLine of lines) {
      const line = this.textProcessor.normalizeSmartQuotes(rawLine);
      const trimmed = line.trim();

      // comments
      if (trimmed.includes('<!--')) { inComment = true; continue; }
      if (trimmed.includes('-->'))   { inComment = false; continue; }
      if (inComment) continue;

      // separator ends current quote capture
      if (trimmed === '---') {
        inAnswer = false;
        continue;
      }

      if (trimmed.startsWith('### Q')) {
        // flush previous
        if (currentQuestion && currentAnswer) {
          questions.push({
            question: currentQuestion,
            expectedAnswer: currentAnswer.trim(),
            quotedText: currentQuotedText ? currentQuotedText.trim() : null
          });
        }
        // start new
        currentQuestion = trimmed.replace(/^### Q\d+\.\s*/, '');
        currentAnswer = '';
        currentQuotedText = null;
        inAnswer = false;
        continue;
      }

      if (trimmed.startsWith('**A:**')) {
        inAnswer = true;
        currentAnswer = trimmed.replace('**A:**', '').trim();
        continue;
      }

      // accumulate multi-line answer until separator or next section
      if (inAnswer && trimmed && !trimmed.startsWith('>')) {
        currentAnswer += ' ' + trimmed;
        continue;
      }

      // capture any blockquote lines after the answer as quote text
      if (inAnswer && trimmed.startsWith('>')) {
        const piece = this.textProcessor.stripMarkdownQuote(trimmed);
        if (piece) {
          currentQuotedText = currentQuotedText ? `${currentQuotedText} ${piece}` : piece;
        }
        continue;
      }
    }

    // flush last
    if (currentQuestion && currentAnswer) {
      questions.push({
        question: currentQuestion,
        expectedAnswer: currentAnswer.trim(),
        quotedText: currentQuotedText ? currentQuotedText.trim() : null
      });
    }

    return questions;
  }
}

module.exports = { QuestionProcessor };