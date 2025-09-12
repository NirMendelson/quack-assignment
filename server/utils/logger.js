// Check if we're in a serverless environment (Vercel, Netlify, etc.)
const isServerless = process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Simple console logger for serverless environments
class SimpleLogger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'warn';
  }

  _shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    return levels[level] <= levels[this.level];
  }

  _log(level, message, ...args) {
    if (!this._shouldLog(level)) return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }

  error(message, ...args) {
    this._log('error', message, ...args);
  }

  warn(message, ...args) {
    this._log('warn', message, ...args);
  }

  info(message, ...args) {
    this._log('info', message, ...args);
  }

  debug(message, ...args) {
    this._log('debug', message, ...args);
  }
}

// Use simple logger in serverless environments, Winston otherwise
let logger;

if (isServerless) {
  logger = new SimpleLogger();
} else {
  // Only import and use Winston in non-serverless environments
  try {
    const winston = require('winston');
    const path = require('path');
    const fs = require('fs');

    // Create logs directory
    let logDir = null;
    try {
      logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.warn('Could not create logs directory:', error.message);
      logDir = null;
    }

    logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'warn',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'quack-policy-agent' },
      transports: []
    });

    // Add file transports only if logDir exists
    if (logDir) {
      logger.add(new winston.transports.File({ 
        filename: path.join(logDir, 'error.log'), 
        level: 'error' 
      }));
      logger.add(new winston.transports.File({ 
        filename: path.join(logDir, 'combined.log') 
      }));
    }

    // Always add console transport
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  } catch (error) {
    console.warn('Failed to initialize Winston, falling back to simple logger:', error.message);
    logger = new SimpleLogger();
  }
}

export { logger };
