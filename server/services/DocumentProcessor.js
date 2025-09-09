const { marked } = require('marked');
const axios = require('axios');
const MiniSearch = require('minisearch');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class DocumentProcessor {
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
    this.chunks = [];
    this.persistPath = path.join(process.cwd(), 'data', 'indexes');
  }

  async processDocument(content, filename) {
    try {
      logger.info(`Starting document processing for: ${filename}`);
      
      // Parse markdown
      const parsed = this.parseMarkdown(content);
      
      // Create chunks (both sentences and paragraphs)
      const chunks = this.createChunks(parsed);
      
      // Generate embeddings
      const embeddings = await this.generateEmbeddings(chunks);
      
      // Build keyword index
      this.buildKeywordIndex(chunks);
      
      // Store everything
      this.chunks = chunks;
      this.embeddings = embeddings;
      
      // Persist to disk
      await this.persistIndexes();
      
      logger.info(`Document processing completed: ${chunks.length} chunks, ${embeddings.size} embeddings`);
      
      return { chunks, embeddings: Object.fromEntries(embeddings) };
      
    } catch (error) {
      logger.error('Error processing document:', error);
      throw error;
    }
  }

  parseMarkdown(content) {
    const tokens = marked.lexer(content);
    const sections = [];
    let currentSection = null;
    
    for (const token of tokens) {
      if (token.type === 'heading') {
        currentSection = {
          title: token.text,
          level: token.depth,
          content: [],
          sentences: []
        };
        sections.push(currentSection);
      } else if (token.type === 'paragraph' || token.type === 'list') {
        // If no section exists yet, create a default one
        if (!currentSection) {
          currentSection = {
            title: 'Document Content',
            level: 1,
            content: [],
            sentences: []
          };
          sections.push(currentSection);
        }
        
        if (token.type === 'paragraph') {
          currentSection.content.push(token.text);
          // Split into sentences
          const sentences = this.splitIntoSentences(token.text);
          currentSection.sentences.push(...sentences);
        } else if (token.type === 'list') {
          const listText = token.items.map(item => item.text).join(' ');
          currentSection.content.push(listText);
          const sentences = this.splitIntoSentences(listText);
          currentSection.sentences.push(...sentences);
        }
      }
    }
    
    return sections;
  }

  splitIntoSentences(text) {
    // Simple sentence splitting - can be improved with more sophisticated NLP
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10) // Filter out very short fragments
      .map(s => s.replace(/\s+/g, ' ')); // Normalize whitespace
  }

  createChunks(sections) {
    const chunks = [];
    let chunkId = 0;
    
    for (const section of sections) {
      // Add paragraph-level chunks
      if (section.content.length > 0) {
        const paragraphText = section.content.join(' ');
        if (paragraphText.trim().length > 0) {
          chunks.push({
            id: `p_${chunkId++}`,
            content: paragraphText,
            title: section.title,
            type: 'paragraph',
            section: section.title,
            level: section.level
          });
        }
      }
      
      // Add sentence-level chunks
      for (const sentence of section.sentences) {
        if (sentence.trim().length > 0) {
          chunks.push({
            id: `s_${chunkId++}`,
            content: sentence,
            title: section.title,
            type: 'sentence',
            section: section.title,
            level: section.level
          });
        }
      }
    }
    return chunks;
  }

  async generateEmbeddings(chunks) {
    try {
      if (chunks.length === 0) {
        throw new Error('No chunks to process - document may be empty or malformed');
      }
      
      logger.info(`Generating embeddings for ${chunks.length} chunks`);
      
      const texts = chunks.map(chunk => chunk.content);
      
      // Use Voyage AI REST API
      const response = await axios.post('https://api.voyageai.com/v1/embeddings', {
        input: texts,
        model: 'voyage-3-large',
        input_type: 'document'
      }, {
        headers: {
          'Authorization': `Bearer ${this.voyageApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const embeddings = new Map();
      chunks.forEach((chunk, index) => {
        embeddings.set(chunk.id, response.data.data[index].embedding);
      });
      
      logger.info(`Generated ${embeddings.size} embeddings`);
      return embeddings;
      
    } catch (error) {
      logger.error('Error generating embeddings:', error.message);
      throw error;
    }
  }

  buildKeywordIndex(chunks) {
    this.keywordIndex.removeAll();
    this.keywordIndex.addAll(chunks);
    logger.info(`Built keyword index with ${chunks.length} documents`);
  }

  async persistIndexes() {
    try {
      await fs.mkdir(this.persistPath, { recursive: true });
      
      // Save embeddings
      const embeddingsData = Object.fromEntries(this.embeddings);
      await fs.writeFile(
        path.join(this.persistPath, 'embeddings.json'),
        JSON.stringify(embeddingsData, null, 2)
      );
      
      // Save chunks
      await fs.writeFile(
        path.join(this.persistPath, 'chunks.json'),
        JSON.stringify(this.chunks, null, 2)
      );
      
      // Save keyword index
      const indexData = this.keywordIndex.toJSON();
      await fs.writeFile(
        path.join(this.persistPath, 'keyword_index.json'),
        JSON.stringify(indexData, null, 2)
      );
      
      logger.info('Indexes persisted to disk');
      
    } catch (error) {
      logger.error('Error persisting indexes:', error);
      throw error;
    }
  }

  async loadIndexes() {
    try {
      // Load chunks
      const chunksData = await fs.readFile(
        path.join(this.persistPath, 'chunks.json'),
        'utf-8'
      );
      this.chunks = JSON.parse(chunksData);
      
      // Load embeddings
      const embeddingsData = await fs.readFile(
        path.join(this.persistPath, 'embeddings.json'),
        'utf-8'
      );
      this.embeddings = new Map(Object.entries(JSON.parse(embeddingsData)));
      
      // Load keyword index
      const indexData = await fs.readFile(
        path.join(this.persistPath, 'keyword_index.json'),
        'utf-8'
      );
      this.keywordIndex = MiniSearch.loadJS(JSON.parse(indexData), {
        fields: ['content', 'title'],
        storeFields: ['id', 'content', 'title', 'type', 'section'],
        searchOptions: {
          boost: { content: 2, title: 1 },
          fuzzy: 0.2,
          prefix: true
        }
      });
      
      logger.info('Indexes loaded from disk');
      
    } catch (error) {
      logger.warn('Could not load indexes from disk:', error.message);
      // Continue with empty indexes
    }
  }

  getChunks() {
    return this.chunks;
  }

  getEmbeddings() {
    return this.embeddings;
  }

  getKeywordIndex() {
    return this.keywordIndex;
  }
}

module.exports = { DocumentProcessor };
