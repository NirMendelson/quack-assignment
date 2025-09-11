const fs = require('fs').promises;
const path = require('path');
const { DocumentProcessor } = require('../../server/services/DocumentProcessor');
const { SearchService } = require('../../server/services/SearchService');
const { AnswerService } = require('../../server/services/AnswerService');
const { QuestionProcessor } = require('./QuestionProcessor');
const { TestReporter } = require('./TestReporter');
const { logger } = require('../../server/utils/logger');

class TestRunner {
  constructor() {
    // Initialize the test runner by validating environment and setting up all required services
    this.validateEnvironment();
    
    this.documentProcessor = new DocumentProcessor();
    this.searchService = new SearchService();
    this.answerService = new AnswerService();
    this.questionProcessor = new QuestionProcessor(this.searchService, this.answerService);
    this.testReporter = new TestReporter();
    this.testResults = [];
  }

  validateEnvironment() {
    // Check that all required API keys are present in environment variables
    const requiredVars = ['OPENAI_API_KEY', 'VOYAGE_API_KEY', 'COHERE_API_KEY'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Environment variables loaded successfully');
  }

  async runAllTests() {
    // Main entry point that orchestrates the entire test execution process
    console.log('🦆 Starting Automated Policy Agent Tests...\n');
    
    const testDirs = await this.getTestDirectories();
    console.log(`Found ${testDirs.length} test directories: ${testDirs.join(', ')}\n`);

    // For now, only run the first test (test1) to limit execution time
    const testToRun = testDirs[2]; // test3
    console.log(`🎯 Running only: ${testToRun} (limited test mode)\n`);

    console.log(`📁 Processing ${testToRun}...`);
    await this.runTest(testToRun);

    // Generate and display the final test report
    await this.testReporter.generateReport(this.testResults);
  }

  async getTestDirectories() {
    // Scan the data directory to find all test folders (test1, test2, etc.)
    const dataDir = path.join(process.cwd(), 'data');
    const entries = await fs.readdir(dataDir, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('test'))
      .map(entry => entry.name)
      .sort();
  }

  async runTest(testDir) {
    // Execute a single test by processing the policy document and running all Q&A tests
    try {
      const testPath = path.join(process.cwd(), 'data', testDir);
      
      // Find the policy file (markdown document to be tested)
      const policyFile = await this.findPolicyFile(testPath);
      if (!policyFile) {
        throw new Error(`No policy file found in ${testDir}`);
      }

      // Find the Q&A file (contains questions and expected answers)
      const qaFile = await this.findQAFile(testPath);
      if (!qaFile) {
        throw new Error(`No Q&A file found in ${testDir}`);
      }

      console.log(`  📄 Policy: ${policyFile}`);
      console.log(`  ❓ Q&A: ${qaFile}`);

      // Process the policy document into searchable chunks and indexes
      const policyContent = await fs.readFile(path.join(testPath, policyFile), 'utf-8');
      const processedDoc = await this.documentProcessor.processDocument(policyContent, policyFile);
      
      // Set up search service with the processed document
      this.searchService.setDocumentProcessor(this.documentProcessor);

      // Parse Q&A file to extract questions and expected answers
      const qaContent = await fs.readFile(path.join(testPath, qaFile), 'utf-8');
      const questions = this.questionProcessor.parseQAFile(qaContent);

      console.log(`  📊 Found ${questions.length} questions`);

      // Test each question by searching, generating answers, and evaluating correctness
      const testResults = [];
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        console.log(`    Q${i + 1}: ${question.question.substring(0, 60)}...`);
        
        try {
          const result = await this.questionProcessor.testQuestion(question, testDir, i + 1, qaContent);
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

      // Store the test results for this test directory
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
    // Locate the policy document file (markdown file that doesn't contain 'q&a' in the name)
    const files = await fs.readdir(testPath);
    return files.find(file => file.endsWith('.md') && !file.includes('q&a') && !file.includes('qa'));
  }

  async findQAFile(testPath) {
    // Locate the Q&A file (markdown file that contains 'q&a' or 'qa' in the name)
    const files = await fs.readdir(testPath);
    return files.find(file => file.includes('q&a') || file.includes('qa'));
  }
}

module.exports = { TestRunner };
