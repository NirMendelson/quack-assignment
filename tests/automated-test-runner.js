// Load environment variables first
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { DocumentProcessor } = require('../server/services/DocumentProcessor');
const { SearchService } = require('../server/services/SearchService');
const { AnswerService } = require('../server/services/AnswerService');
const { logger } = require('../server/utils/logger');

class AutomatedTestRunner {
  constructor() {
    // Validate required environment variables
    this.validateEnvironment();
    
    this.documentProcessor = new DocumentProcessor();
    this.searchService = new SearchService();
    this.answerService = new AnswerService();
    this.testResults = [];
  }

  validateEnvironment() {
    const requiredVars = ['OPENAI_API_KEY', 'VOYAGE_API_KEY', 'COHERE_API_KEY'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Environment variables loaded successfully');
  }

  async runAllTests() {
    console.log('🦆 Starting Automated Policy Agent Tests...\n');
    
    const testDirs = await this.getTestDirectories();
    console.log(`Found ${testDirs.length} test directories: ${testDirs.join(', ')}\n`);

    // For now, only run the first test
    const testToRun = testDirs[0]; // test1
    console.log(`🎯 Running only: ${testToRun} (limited test mode)\n`);

    console.log(`📁 Processing ${testToRun}...`);
    await this.runTest(testToRun);

    await this.generateReport();
  }

  async getTestDirectories() {
    const dataDir = path.join(process.cwd(), 'data');
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('test'))
      .map(entry => entry.name)
      .sort();
  }

  async runTest(testDir) {
    try {
      const testPath = path.join(process.cwd(), 'data', testDir);
      
      // Find the policy file
      const policyFile = await this.findPolicyFile(testPath);
      if (!policyFile) {
        throw new Error(`No policy file found in ${testDir}`);
      }

      // Find the Q&A file
      const qaFile = await this.findQAFile(testPath);
      if (!qaFile) {
        throw new Error(`No Q&A file found in ${testDir}`);
      }

      console.log(`  📄 Policy: ${policyFile}`);
      console.log(`  ❓ Q&A: ${qaFile}`);

      // Process the policy document
      const policyContent = await fs.readFile(path.join(testPath, policyFile), 'utf-8');
      const processedDoc = await this.documentProcessor.processDocument(policyContent, policyFile);
      
      // Set up search service
      this.searchService.setDocumentProcessor(this.documentProcessor);

      // Parse Q&A file
      const qaContent = await fs.readFile(path.join(testPath, qaFile), 'utf-8');
      const questions = this.parseQAFile(qaContent);

      console.log(`  📊 Found ${questions.length} questions`);

      // Test each question
      const testResults = [];
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        console.log(`    Q${i + 1}: ${question.question.substring(0, 60)}...`);
        
        try {
          const result = await this.testQuestion(question, testDir, i + 1);
          testResults.push(result);
        } catch (error) {
          console.log(`    ❌ Error: ${error.message}`);
          testResults.push({
            testDir,
            questionNumber: i + 1,
            question: question.question,
            expectedAnswer: question.expectedAnswer,
            actualAnswer: null,
            isCorrect: false,
            error: error.message,
            confidence: 0
          });
        }
      }

      this.testResults.push({
        testDir,
        policyFile,
        qaFile,
        totalQuestions: questions.length,
        results: testResults
      });

      console.log(`  ✅ Completed ${testDir}\n`);

    } catch (error) {
      console.log(`  ❌ Failed ${testDir}: ${error.message}\n`);
      this.testResults.push({
        testDir,
        error: error.message,
        results: []
      });
    }
  }

  async findPolicyFile(testPath) {
    const files = await fs.readdir(testPath);
    return files.find(file => file.endsWith('.md') && !file.includes('q&a') && !file.includes('qa'));
  }

  async findQAFile(testPath) {
    const files = await fs.readdir(testPath);
    return files.find(file => file.includes('q&a') || file.includes('qa'));
  }

  parseQAFile(content) {
    const questions = [];
    const lines = content.split('\n');
    let currentQuestion = null;
    let currentAnswer = null;
    let inAnswer = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
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

  async testQuestion(question, testDir, questionNumber) {
    // Search for relevant content
    const searchResults = await this.searchService.search(question.question, 5);
    
    if (searchResults.length === 0) {
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

    // Rerank results
    const rerankedResults = await this.answerService.rerankResults(question.question, searchResults);
    
    // Generate answer
    const answer = await this.answerService.generateAnswer(question.question, rerankedResults);
    
    // Clean up citations from the answer text
    const cleanAnswer = this.cleanAnswerText(answer.text);
    
    // Evaluate correctness using LLM
    const isCorrect = await this.evaluateAnswerWithLLM(question.expectedAnswer, cleanAnswer, question.question);
    
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

  async evaluateAnswerWithLLM(expected, actual, question) {
    try {
      const prompt = `You are an expert evaluator for policy Q&A systems. Your task is to determine if the actual answer correctly addresses the question and matches the expected answer.

EVALUATION CRITERIA:
1. Semantic Equivalence: The actual answer should convey the same meaning as the expected answer
2. Completeness: The actual answer should cover the key information from the expected answer
3. Accuracy: The actual answer should be factually correct
4. Format Tolerance: Different wording, punctuation, or formatting should not affect correctness
5. Context Awareness: Consider that "No data about it in the text" and "I could not find this in the policy" are equivalent

QUESTION: ${question}

EXPECTED ANSWER: ${expected}

ACTUAL ANSWER: ${actual}

Please evaluate if the actual answer is correct. Consider:
- Are the key facts the same?
- Is the meaning equivalent?
- Are both answers saying the same thing in different words?
- If one says "no data" and the other says "could not find", they are equivalent

Respond with ONLY "CORRECT" or "INCORRECT" followed by a brief explanation.`;

      const response = await this.answerService.openai.chat.completions.create({
        model: 'gpt-4-1106-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert evaluator for policy Q&A systems. Be fair and consider semantic equivalence.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 100
      });

      const evaluation = response.choices[0].message.content.trim();
      const isCorrect = evaluation.startsWith('CORRECT');
      
      console.log(`    Evaluation: ${isCorrect ? '✅' : '❌'} ${evaluation}`);
      
      return isCorrect;

    } catch (error) {
      console.log(`    Evaluation error: ${error.message}`);
      // Fallback to simple keyword matching if LLM fails
      return this.evaluateAnswerFallback(expected, actual);
    }
  }

  evaluateAnswerFallback(expected, actual) {
    // Fallback evaluation - simple keyword matching
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
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .map(word => word.toLowerCase());
  }

  checkContradiction(expected, actual) {
    // Simple contradiction detection
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
    // Remove citation patterns like [c:1 -> Two-factor authentication (2FA)]
    return text.replace(/\[c:\d+\s*->[^\]]+\]/g, '')
      // Remove bold markers around quoted text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // Clean up extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      testResults: this.testResults
    };

    // Save detailed report
    const reportPath = path.join(process.cwd(), 'test-results.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('📊 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Total Questions: ${report.summary.totalQuestions}`);
    console.log(`Correct Answers: ${report.summary.correctAnswers}`);
    console.log(`Accuracy: ${(report.summary.accuracy * 100).toFixed(1)}%`);
    console.log(`Average Confidence: ${(report.summary.averageConfidence * 100).toFixed(1)}%`);
    console.log(`\nDetailed report saved to: ${reportPath}`);
    
    // Print per-test breakdown
    console.log('\n📋 PER-TEST BREAKDOWN');
    console.log('=====================');
    for (const test of this.testResults) {
      if (test.error) {
        console.log(`${test.testDir}: ❌ ${test.error}`);
      } else {
        const correct = test.results.filter(r => r.isCorrect).length;
        const accuracy = (correct / test.totalQuestions * 100).toFixed(1);
        console.log(`${test.testDir}: ${correct}/${test.totalQuestions} (${accuracy}%)`);
      }
    }
  }

  generateSummary() {
    const totalTests = this.testResults.length;
    const totalQuestions = this.testResults.reduce((sum, test) => 
      sum + (test.results ? test.results.length : 0), 0);
    const correctAnswers = this.testResults.reduce((sum, test) => 
      sum + (test.results ? test.results.filter(r => r.isCorrect).length : 0), 0);
    const accuracy = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;
    
    const allResults = this.testResults.flatMap(test => test.results || []);
    const averageConfidence = allResults.length > 0 
      ? allResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / allResults.length 
      : 0;

    return {
      totalTests,
      totalQuestions,
      correctAnswers,
      accuracy,
      averageConfidence
    };
  }
}

// Run the tests
async function main() {
  try {
    const runner = new AutomatedTestRunner();
    await runner.runAllTests();
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { AutomatedTestRunner };
