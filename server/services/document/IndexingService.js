const axios = require('axios');
const MiniSearch = require('minisearch');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../utils/logger');

class IndexingService {
  constructor() {
    this.voyageApiKey = process.env.VOYAGE_API_KEY;
    this.embeddings = new Map();
    this.keywordIndex = new MiniSearch({
      fields: ['content', 'title'],
      storeFields: ['id', 'content', 'title', 'type', 'section'],
      searchOptions: {
        boost: { content: 2, title: 1 },
        fuzzy: 0.2,
        prefix: true
      }
    });
    this.persistPath = path.join(process.cwd(), 'data', 'indexes');
  }

  async generateEmbeddings(chunks) {
    try {
      logger.info(`Generating embeddings for ${chunks.length} chunks`);
      
      // Batch process chunks for embeddings
      const batchSize = 10;
      const embeddings = new Map();
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchEmbeddings = await this.getBatchEmbeddings(batch);
        
        batch.forEach((chunk, index) => {
          if (batchEmbeddings[index]) {
            embeddings.set(chunk.id, batchEmbeddings[index]);
          }
        });
        
        // Small delay to avoid rate limiting
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info(`Generated ${embeddings.size} embeddings`);
      return embeddings;
    } catch (error) {
      logger.error('Error generating embeddings:', error.message);
      throw error;
    }
  }

  async getBatchEmbeddings(chunks) {
    try {
      const texts = chunks.map(chunk => chunk.content);
      
      const response = await axios.post('https://api.voyageai.com/v1/embeddings', {
        input: texts,
        model: 'voyage-3'
      }, {
        headers: {
          'Authorization': `Bearer ${this.voyageApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data.data.map(item => item.embedding);
    } catch (error) {
      logger.error('Error getting batch embeddings:', error.message);
      throw error;
    }
  }

  buildKeywordIndex(chunks) {
    try {
      logger.info(`Building keyword index for ${chunks.length} chunks`);
      
      // Clear existing index
      this.keywordIndex = new MiniSearch({
        fields: ['content', 'title'],
        storeFields: ['id', 'content', 'title', 'type', 'section'],
        searchOptions: {
          boost: { content: 2, title: 1 },
          fuzzy: 0.2,
          prefix: true
        }
      });
      
      // Add chunks to index
      chunks.forEach(chunk => {
        this.keywordIndex.add({
          id: chunk.id,
          content: chunk.content,
          title: chunk.title || '',
          type: chunk.type,
          section: chunk.section || ''
        });
      });
      
      logger.info(`Built keyword index with ${this.keywordIndex.size} documents`);
    } catch (error) {
      logger.error('Error building keyword index:', error.message);
      throw error;
    }
  }

  async persistIndexes() {
    try {
      // Ensure directory exists
      await fs.mkdir(this.persistPath, { recursive: true });
      
      // Save keyword index
      const indexData = this.keywordIndex.toJSON();
      await fs.writeFile(
        path.join(this.persistPath, 'keyword-index.json'),
        JSON.stringify(indexData, null, 2)
      );
      
      // Save embeddings
      const embeddingsData = Object.fromEntries(this.embeddings);
      await fs.writeFile(
        path.join(this.persistPath, 'embeddings.json'),
        JSON.stringify(embeddingsData, null, 2)
      );
      
      logger.info(`Persisted indexes to ${this.persistPath}`);
    } catch (error) {
      logger.error('Error persisting indexes:', error.message);
      throw error;
    }
  }

  async loadIndexes() {
    try {
      // Load keyword index
      const indexPath = path.join(this.persistPath, 'keyword-index.json');
      const indexData = await fs.readFile(indexPath, 'utf8');
      this.keywordIndex = MiniSearch.loadJSON(indexData);
      
      // Load embeddings
      const embeddingsPath = path.join(this.persistPath, 'embeddings.json');
      const embeddingsData = await fs.readFile(embeddingsPath, 'utf8');
      const embeddingsObj = JSON.parse(embeddingsData);
      this.embeddings = new Map(Object.entries(embeddingsObj));
      
      logger.info(`Loaded indexes from ${this.persistPath}`);
    } catch (error) {
      logger.error('Error loading indexes:', error.message);
      // Don't throw error, just log it - indexes will be rebuilt if needed
    }
  }

  getKeywordIndex() {
    return this.keywordIndex;
  }

  getEmbeddings() {
    return this.embeddings;
  }
}

module.exports = { IndexingService };
