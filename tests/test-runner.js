const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const { DocumentProcessor } = require('../server/services/DocumentProcessor');
const { SearchService } = require('../server/services/SearchService');
const { AnswerService } = require('../server/services/AnswerService');
const { logger } = require('../server/utils/logger');

class TestRunner {
  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.searchService = new SearchService();
    this.answerService = new AnswerService();
    this.results = [];
  }

  async runTests() {
    try {
      logger.info('Starting test suite...');
      
      // Load test questions
      const testData = JSON.parse(
        await fs.readFile(path.join(__dirname, 'test-questions.json'), 'utf-8')
      );
      
      // Load and process test document
      const documentPath = path.join(__dirname, 'test-documents', 'sample-policy.md');
      const documentContent = await fs.readFile(documentPath, 'utf-8');
      
      logger.info('Processing test document...');
      await this.documentProcessor.processDocument(documentContent, 'sample-policy.md');
      
      // Initialize search service
      this.searchService.setDocumentProcessor(this.documentProcessor);
      
      logger.info(`Running ${testData.testCases.length} test cases...`);
      
      // Run each test case
      for (const testCase of testData.testCases) {
        await this.runTestCase(testCase);
      }
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      logger.error('Test runner error:', error);
    }
  }

  async runTestCase(testCase) {
    try {
      logger.info(`Testing: ${testCase.question}`);
      
      // Search for relevant chunks
      const searchResults = await this.searchService.search(testCase.question);
      
      // Generate answer
      const answer = await this.answerService.generateAnswer(testCase.question, searchResults);
      
      // Evaluate result
      const result = {
        question: testCase.question,
        expectedAnswer: testCase.expectedAnswer,
        actualAnswer: answer.text,
        shouldFind: testCase.shouldFind,
        found: !answer.text.includes('I could not find this in the policy'),
        confidence: answer.confidence,
        citations: answer.citations?.length || 0,
        passed: this.evaluateAnswer(testCase, answer),
        category: testCase.category
      };
      
      this.results.push(result);
      
      logger.info(`Test ${result.passed ? 'PASSED' : 'FAILED'}: ${testCase.question}`);
      
    } catch (error) {
      logger.error(`Error in test case: ${testCase.question}`, error);
      this.results.push({
        question: testCase.question,
        error: error.message,
        passed: false
      });
    }
  }

  evaluateAnswer(testCase, answer) {
    if (testCase.shouldFind && answer.text.includes('I could not find this in the policy')) {
      return false; // Should have found answer but didn't
    }
    
    if (!testCase.shouldFind && !answer.text.includes('I could not find this in the policy')) {
      return false; // Should have refused but gave answer
    }
    
    if (testCase.shouldFind) {
      // Check if the answer contains key information from expected answer
      const expectedKeywords = testCase.expectedAnswer.toLowerCase().split(/\s+/);
      const actualText = answer.text.toLowerCase();
      
      const keywordMatches = expectedKeywords.filter(keyword => 
        actualText.includes(keyword)
      ).length;
      
      // At least 50% of keywords should match
      return keywordMatches / expectedKeywords.length >= 0.5;
    }
    
    return true; // Correctly refused to answer
  }

  generateReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    const report = {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: `${Math.round((passedTests / totalTests) * 100)}%`
      },
      results: this.results
    };
    
    console.log('\n=== TEST REPORT ===');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${report.summary.successRate}`);
    
    console.log('\n=== FAILED TESTS ===');
    this.results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`\nQuestion: ${r.question}`);
        console.log(`Expected: ${r.expectedAnswer}`);
        console.log(`Actual: ${r.actualAnswer}`);
        if (r.error) console.log(`Error: ${r.error}`);
      });
    
    // Save detailed report
    const reportPath = path.join(__dirname, 'test-report.json');
    fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    logger.info(`Detailed report saved to: ${reportPath}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const testRunner = new TestRunner();
  testRunner.runTests().catch(console.error);
}

module.exports = { TestRunner };
