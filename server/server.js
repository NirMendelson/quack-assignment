const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { DocumentProcessor } = require('./services/DocumentProcessor');
const { SearchService } = require('./services/SearchService');
const { AnswerService } = require('./services/AnswerService');
const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/markdown' || path.extname(file.originalname) === '.md') {
      cb(null, true);
    } else {
      cb(new Error('Only markdown files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Initialize services
const documentProcessor = new DocumentProcessor();
const searchService = new SearchService();
const answerService = new AnswerService();

// Routes
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`Processing uploaded file: ${req.file.originalname}`);
    
    // Read the uploaded file
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    
    // Process the document
    const processedDoc = await documentProcessor.processDocument(
      fileContent, 
      req.file.originalname
    );
    
    // Clean up uploaded file
    await fs.unlink(req.file.path);
    
    logger.info(`Document processed successfully: ${processedDoc.chunks.length} chunks created`);
    
    res.json({
      success: true,
      documentName: req.file.originalname,
      chunksCount: processedDoc.chunks.length,
      message: 'Document processed and indexed successfully'
    });
    
  } catch (error) {
    logger.error('Error processing document:', error);
    res.status(500).json({ 
      error: 'Failed to process document',
      details: error.message 
    });
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    logger.info(`Processing query: ${question}`);
    
    // Search for relevant chunks
    const searchResults = await searchService.search(question);
    
    // Generate answer
    const answer = await answerService.generateAnswer(question, searchResults);
    
    logger.info(`Answer generated successfully`);
    
    res.json({
      answer: answer.text,
      citations: answer.citations,
      confidence: answer.confidence,
      chunks: searchResults.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score
      }))
    });
    
  } catch (error) {
    logger.error('Error processing query:', error);
    res.status(500).json({ 
      error: 'Failed to process query',
      details: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
