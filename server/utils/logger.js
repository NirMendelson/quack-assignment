import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Check if we're in a serverless environment (Vercel, Netlify, etc.)
const isServerless = process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Create logs directory only if not in serverless environment
let logDir = null;
if (!isServerless) {
  try {
    logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    console.warn('Could not create logs directory:', error.message);
    logDir = null;
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'warn',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'quack-policy-agent' },
  transports: []
});

// Add file transports only if not in serverless environment and logDir exists
if (!isServerless && logDir) {
  logger.add(new winston.transports.File({ 
    filename: path.join(logDir, 'error.log'), 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: path.join(logDir, 'combined.log') 
  }));
}

// Always add console transport for serverless environments
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  )
}));

export { logger };
