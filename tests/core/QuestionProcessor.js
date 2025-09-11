class QuestionProcessor {
  constructor(searchService, answerService) {
    this.searchService = searchService;
    this.answerService = answerService;
  }

  // Helper methods for robust text processing
  normalizeSmartQuotes(s) {
    if (!s) return '';
    return s
      // real smart quotes to straight
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // em/en dashes → hyphen
      .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
      // non-breaking and thin spaces → normal space
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  }
  
  stripOuterQuotesAndItalics(s) {
    if (!s) return '';
    let t = s.trim();
    // strip italics
    t = t.replace(/^\*+/, '').replace(/\*+$/, '');
    // strip BOTH straight and smart quotes at ends
    t = t.replace(/^[“”"]+/, '').replace(/[“”"]+$/, '');
    return t.trim();
  }
  
  normalizeForMatch(s) {
    if (!s) return '';
    return this.stripOuterQuotesAndItalics(this.normalizeSmartQuotes(s))
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  

  stripMarkdownQuote(line) {
    let t = line.replace(/^>\s*/, '');
    t = this.normalizeSmartQuotes(t).trim();
    t = t.replace(/^\*+/, '').replace(/\*+$/, '').trim();
    t = t.replace(/^"+/, '').replace(/"+$/, '').trim();
    t = t.replace(/^`+/, '').replace(/`+$/, '').trim();
    return t;
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

  findAllAnswerChunks(expectedAnswer, chunks, quotedText = null) {
    // First, try to find the quoted text (this is what actually exists in chunks)
    if (quotedText) {
      const exactMatches = this.findChunksWithText(chunks, quotedText);
      if (exactMatches.length > 0) {
        return exactMatches;
      }
      
      // Try half-quotes of the quoted text
      const quotedHalves = this.splitIntoHalves(quotedText);
      for (const half of quotedHalves) {
        const halfMatches = this.findChunksWithText(chunks, half);
        if (halfMatches.length > 0) {
          return halfMatches;
        }
      }
    }
    
    // Fallback: try to find the expected answer text directly
    const expectedMatches = this.findChunksWithText(chunks, expectedAnswer);
    if (expectedMatches.length > 0) {
      return expectedMatches;
    }
    
    // Try half-quotes of the expected answer
    const expectedHalves = this.splitIntoHalves(expectedAnswer);
    for (const half of expectedHalves) {
      const halfMatches = this.findChunksWithText(chunks, half);
      if (halfMatches.length > 0) {
        return halfMatches;
      }
    }
    
    // Final fallback to keyword matching
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

  extractQuotedTextFromQA(expectedAnswer, qaContent) {
    if (!qaContent) return null;
    const lines = this.normalizeSmartQuotes(qaContent).split('\n');
    let idx = lines.findIndex(l => this.normalizeSmartQuotes(l).includes(this.normalizeSmartQuotes(expectedAnswer)));
    if (idx === -1) return null;

    // collect up to 5 subsequent blockquote lines as one quote blob
    const pieces = [];
    for (let i = idx; i < Math.min(idx + 8, lines.length); i++) {
      const t = this.normalizeSmartQuotes(lines[i]).trim();
      if (t.startsWith('>')) pieces.push(this.stripMarkdownQuote(t));
    }
    const joined = pieces.join(' ').trim();
    return joined || null;
  }

  extractQuotedText(expectedAnswer) {
    // Look for text in quotes with asterisks (more flexible pattern)
    // Pattern: > *"text"* (the quoted text is between the quotes)
    const quoteMatch = expectedAnswer.match(/>\s*\*\s*[""]([^""]+)[""]\s*\*/);
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
    const words = this.normalizeSmartQuotes(text).trim().split(/\s+/);
    const midPoint = Math.floor(words.length / 2);
    
    return [
      words.slice(0, midPoint).join(' '),
      words.slice(midPoint).join(' ')
    ];
  }

  findChunksWithText(chunks, searchText) {
    const needle = this.normalizeForMatch(searchText);
  
    return chunks.filter(chunk => {
      const hay = this.normalizeForMatch(chunk.content);
      return hay.includes(needle);
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
          if (source === 'exact') {
            console.log(`  - ${source}: bonus ${data.bonusApplied.toFixed(6)}`);
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
            return sum + data.bonusApplied;
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
              console.log(`  - ${source}: bonus ${data.bonusApplied.toFixed(6)}`);
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
              return sum + data.bonusApplied;
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
      const line = this.normalizeSmartQuotes(rawLine);
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
        const piece = this.stripMarkdownQuote(trimmed);
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
