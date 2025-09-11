// Load environment variables first
import 'dotenv/config';

import { TestRunner } from './core/TestRunner.js';

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

// Run the main function
main();

export { TestRunner };