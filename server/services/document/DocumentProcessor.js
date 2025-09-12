import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { MarkdownParser } from './MarkdownParser.js';
import { ChunkingService } from './ChunkingService.js';
import { IndexingService } from './IndexingService.js';

class DocumentProcessor {
  constructor() {
    this.markdownParser = new MarkdownParser();
    this.chunkingService = new ChunkingService();
    this.indexingService = new IndexingService();
    this.chunks = [];
  }

  async processDocument(content, filename) {
    try {
      logger.info(`Starting document processing for: ${filename}`);
      
      // Parse markdown
      const parsed = this.markdownParser.parseMarkdown(content);
      
      // Create chunks (both sentences and paragraphs)
      const chunks = this.chunkingService.createChunks(parsed);
      
      // Generate embeddings
      const embeddings = await this.indexingService.generateEmbeddings(chunks);
      
      // Build keyword index
      this.indexingService.buildKeywordIndex(chunks);
      
      // Store everything
      this.chunks = chunks;
      this.indexingService.embeddings = embeddings;
      
      // Persist to disk
      await this.indexingService.persistIndexes();
      
      // Save chunks for inspection
      await this.saveChunksForInspection(chunks, filename);
      
      logger.info(`Document processing completed for: ${filename}`);
      logger.info(`Created ${chunks.length} chunks`);
      
      return {
        chunks,
        embeddings,
        filename
      };
      
    } catch (error) {
      logger.error(`Error processing document ${filename}:`, error.message);
      throw error;
    }
  }

  async loadDocument(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const filename = path.basename(filePath);
      return this.processDocument(content, filename);
    } catch (error) {
      logger.error(`Error loading document ${filePath}:`, error.message);
      throw error;
    }
  }

  async loadIndexes() {
    try {
      await this.indexingService.loadIndexes();
      logger.info('Indexes loaded successfully');
    } catch (error) {
      // This is expected when starting fresh - indexes will be created when document is uploaded
      logger.info('No existing indexes to load - will create new ones when document is uploaded');
    }
  }

  getChunks() {
    return this.chunks;
  }

  getKeywordIndex() {
    return this.indexingService.getKeywordIndex();
  }

  getEmbeddings() {
    return this.indexingService.getEmbeddings();
  }

  async saveChunksForInspection(chunks, filename) {
    try {
      // Skip saving in serverless environments
      const isServerless = process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME;
      if (isServerless) {
        logger.info('Skipping chunk inspection save in serverless environment');
        return;
      }

      const inspectionDir = path.join(process.cwd(), 'data', 'chunks-inspection');
      await fs.mkdir(inspectionDir, { recursive: true });
      
      const inspectionFile = path.join(inspectionDir, `${filename.replace('.md', '')}-chunks.json`);
      await fs.writeFile(inspectionFile, JSON.stringify(chunks, null, 2));
      
      logger.info(`Saved chunks for inspection: ${inspectionFile}`);
    } catch (error) {
      logger.error('Error saving chunks for inspection:', error.message);
    }
  }

  getChunkStats() {
    const stats = {
      total: this.chunks.length,
      byType: {}
    };
    
    this.chunks.forEach(chunk => {
      stats.byType[chunk.type] = (stats.byType[chunk.type] || 0) + 1;
    });
    
    return stats;
  }
}

export { DocumentProcessor };
