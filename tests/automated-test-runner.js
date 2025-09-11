// Load environment variables first
require('dotenv').config();

const { TestRunner } = require('./core/TestRunner');

// Run the tests
async function main() {
  try {
    const runner = new TestRunner();
    await runner.runAllTests();
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { TestRunner };