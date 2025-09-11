import fs from 'fs/promises';
import path from 'path';

class TestReporter {
  async generateReport(testResults) {
    // Generate comprehensive test report with statistics and save to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(testResults),
      testResults: testResults
    };

    // Save detailed report to JSON file
    const reportPath = path.join(process.cwd(), 'test-results.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Print summary to console
    this.printSummary(report.summary);
    
    // Print per-test breakdown
    this.printPerTestBreakdown(testResults);
    
    console.log(`\nDetailed report saved to: ${reportPath}`);
  }

  generateSummary(testResults) {
    // Calculate overall test statistics from all test results
    const totalTests = testResults.length;
    const totalQuestions = testResults.reduce((sum, test) => 
      sum + (test.results ? test.results.length : 0), 0);
    const correctAnswers = testResults.reduce((sum, test) => 
      sum + (test.results ? test.results.filter(r => r.isCorrect).length : 0), 0);
    const accuracy = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;
    
    const allResults = testResults.flatMap(test => test.results || []);
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

  printSummary(summary) {
    // Display test summary statistics to console
    console.log('📊 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Total Questions: ${summary.totalQuestions}`);
    console.log(`Correct Answers: ${summary.correctAnswers}`);
    console.log(`Accuracy: ${(summary.accuracy * 100).toFixed(1)}%`);
    console.log(`Average Confidence: ${(summary.averageConfidence * 100).toFixed(1)}%`);
  }

  printPerTestBreakdown(testResults) {
    // Display detailed breakdown for each test directory
    console.log('\n📋 PER-TEST BREAKDOWN');
    console.log('=====================');
    for (const test of testResults) {
      if (test.error) {
        console.log(`${test.testDir}: ❌ ${test.error}`);
      } else {
        const correct = test.results.filter(r => r.isCorrect).length;
        const accuracy = (correct / test.totalQuestions * 100).toFixed(1);
        console.log(`${test.testDir}: ${correct}/${test.totalQuestions} (${accuracy}%)`);
      }
    }
  }
}

export { TestReporter };

