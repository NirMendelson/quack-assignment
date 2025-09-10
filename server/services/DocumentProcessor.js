const { marked } = require('marked');
const axios = require('axios');
const MiniSearch = require('minisearch');
const fs = require('fs').promises;
const path = require('path');
const natural = require('natural');
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
      
      // Save chunks for inspection
      await this.saveChunksForInspection(chunks, filename);
      
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
          sentences: [],
          codeBlocks: []
        };
        sections.push(currentSection);
      } else if (token.type === 'paragraph' || token.type === 'list' || token.type === 'code') {
        // If no section exists yet, create a default one
        if (!currentSection) {
          currentSection = {
            title: 'Document Content',
            level: 1,
            content: [],
            sentences: [],
            codeBlocks: []
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
        } else if (token.type === 'code') {
          // Preserve code blocks with their language and raw content
          const codeBlock = {
            language: token.lang || 'text',
            content: token.text,
            raw: token.raw
          };
          currentSection.codeBlocks.push(codeBlock);
          // Also add to content for general search
          currentSection.content.push(token.text);
          // Split code into lines for better chunking
          const codeLines = this.splitCodeIntoLines(token.text);
          currentSection.sentences.push(...codeLines);
        }
      }
    }
    
    return sections;
  }

  splitIntoSentences(text) {
    // Use proper sentence tokenizer from natural library
    const sentenceTokenizer = new natural.SentenceTokenizer();
    const sentences = sentenceTokenizer.tokenize(text)
      .map(s => s.trim())
      .filter(s => s.length > 10) // Filter out very short fragments
      .map(s => s.replace(/\s+/g, ' ')); // Normalize whitespace
    
    // For very long sentences (common in policy text), try to split further
    const finalSentences = [];
    for (const sentence of sentences) {
      if (sentence.length > 200) {
        // Try to split long sentences on conjunctions
        const parts = sentence.split(/,\s*(?=and|but|or|so|yet|for|nor)/gi);
        if (parts.length > 1) {
          parts.forEach(part => {
            const trimmed = part.trim();
            if (trimmed.length > 10) {
              finalSentences.push(trimmed);
            }
          });
        } else {
          finalSentences.push(sentence);
        }
      } else {
        finalSentences.push(sentence);
      }
    }
    
    return finalSentences;
  }

  splitCodeIntoLines(codeText) {
    // Split code into individual lines, preserving important single-line statements
    const lines = codeText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0) // Keep all non-empty lines
      .map(line => line.replace(/\s+/g, ' ')); // Normalize whitespace but preserve structure
    
    return lines;
  }

  createChunks(sections) {
    const chunks = [];
    let chunkId = 0;
    
    for (const section of sections) {
      // Add paragraph-level chunks
      if (section.content.length > 0) {
        const paragraphText = section.content.join(' ');
        if (paragraphText.trim().length > 0) {
          // Create overlapping windows for better coverage
          const windowedChunks = this.createOverlappingWindows(paragraphText, section, chunkId);
          chunks.push(...windowedChunks);
          chunkId += windowedChunks.length;
        }
      }
      
      // Add code block chunks (preserve all code blocks)
      if (section.codeBlocks && section.codeBlocks.length > 0) {
        const codeChunks = this.createCodeBlockChunks(section, chunkId);
        chunks.push(...codeChunks);
        chunkId += codeChunks.length;
      }
      
      // Add sentence-level chunks with context
      const sentenceChunks = this.createSentenceWindows(section, chunkId);
      chunks.push(...sentenceChunks);
      chunkId += sentenceChunks.length;
      
      // Add individual sentence chunks for precise factoid questions
      const individualSentences = this.createIndividualSentences(section, chunkId);
      chunks.push(...individualSentences);
      chunkId += individualSentences.length;
    }
    return chunks;
  }

  createOverlappingWindows(text, section, startId) {
    const chunks = [];
    const words = text.split(' ');
    const windowSize = 280; // ~280 tokens for good context
    const stride = 100; // ~100 token overlap
    let chunkId = startId;
    
    // Create overlapping windows
    for (let i = 0; i < words.length; i += windowSize - stride) {
      const windowWords = words.slice(i, i + windowSize);
      if (windowWords.length > 20) { // Only create meaningful chunks
        const windowText = windowWords.join(' ');
        chunks.push({
          id: `w_${chunkId++}`,
          content: windowText,
          title: section.title,
          type: 'window',
          section: section.title,
          level: section.level,
          position: i, // Track position for bias correction
          windowSize: windowWords.length
        });
      }
    }
    
    return chunks;
  }

  createSentenceWindows(section, startId) {
    const chunks = [];
    let chunkId = startId;
    const sentences = section.sentences;
    
    // Create 2-3 sentence windows with stride 1
    const windowSize = 3; // 3 sentences per window
    const stride = 1; // Move by 1 sentence
    const maxChars = 350; // Hard character cap to prevent bloated chunks
    
    for (let i = 0; i < sentences.length; i += stride) {
      const windowSentences = sentences.slice(i, i + windowSize);
      if (windowSentences.length >= 2) { // At least 2 sentences
        let windowText = windowSentences.join(' ');
        
        // Apply character cap to prevent bloated chunks
        if (windowText.length > maxChars) {
          windowText = windowText.substring(0, maxChars).trim();
          // Try to end at a word boundary
          const lastSpace = windowText.lastIndexOf(' ');
          if (lastSpace > maxChars * 0.8) { // Only if we don't lose too much content
            windowText = windowText.substring(0, lastSpace);
          }
        }
        
        chunks.push({
          id: `sw_${chunkId++}`,
          content: windowText,
          title: section.title,
          type: 'sentence_window',
          section: section.title,
          level: section.level,
          position: i, // Track position for bias correction
          sentenceCount: windowSentences.length
        });
      }
    }
    
    // Also create individual sentence chunks with context
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (sentence.trim().length > 10) {
        // Prepend lightweight context
        const context = this.getSentenceContext(section, i);
        let contextualSentence = context + sentence;
        
        // Apply character cap to prevent bloated chunks
        const maxChars = 350;
        if (contextualSentence.length > maxChars) {
          contextualSentence = contextualSentence.substring(0, maxChars).trim();
          // Try to end at a word boundary
          const lastSpace = contextualSentence.lastIndexOf(' ');
          if (lastSpace > maxChars * 0.8) { // Only if we don't lose too much content
            contextualSentence = contextualSentence.substring(0, lastSpace);
          }
        }
        
        chunks.push({
          id: `sc_${chunkId++}`,
          content: contextualSentence,
          title: section.title,
          type: 'sentence_context',
          section: section.title,
          level: section.level,
          position: i,
          originalSentence: sentence
        });
      }
    }
    
    return chunks;
  }

  getSentenceContext(section, sentenceIndex) {
    const context = [];
    
    // Add section title
    if (section.title) {
      context.push(`[${section.title}]`);
    }
    
    // Add previous sentence for context (if not first sentence)
    if (sentenceIndex > 0 && section.sentences[sentenceIndex - 1]) {
      const prevSentence = section.sentences[sentenceIndex - 1];
      if (prevSentence.length > 20) {
        context.push(`[Previous: ${prevSentence.substring(0, 50)}...]`);
      }
    }
    
    return context.length > 0 ? context.join(' ') + ' ' : '';
  }

  createIndividualSentences(section, startId) {
    const chunks = [];
    let chunkId = startId;
    const sentences = section.sentences;
    
    // Create individual sentence chunks for precise factoid questions
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (sentence.trim().length > 10) { // Only meaningful sentences
        chunks.push({
          id: `s_${chunkId++}`,
          content: sentence,
          title: section.title,
          type: 'sentence',
          section: section.title,
          level: section.level,
          position: i,
          originalSentence: sentence
        });
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
      
      const BATCH_SIZE = 900; // Safe limit below Voyage AI's 1000 limit
      const embeddings = new Map();
      
      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map(chunk => chunk.content);
        
        logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)`);
        
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
        
        // Map embeddings back to chunks
        batch.forEach((chunk, index) => {
          embeddings.set(chunk.id, response.data.data[index].embedding);
        });
        
        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info(`Generated ${embeddings.size} embeddings`);
      return embeddings;
      
    } catch (error) {
      // Extract and log the actual API error message from Voyage AI BEFORE Winston logs it
      if (error.response && error.response.data) {
        console.log('🔍 Voyage AI API Error Response:', error.response.data);
        console.log('🔍 Status:', error.response.status, error.response.statusText);
        
        // Create a clean error with just the important info
        const cleanError = new Error(`Voyage AI API Error: ${JSON.stringify(error.response.data)}`);
        cleanError.status = error.response.status;
        cleanError.responseData = error.response.data;
        throw cleanError;
      } else {
        console.log('🔍 No response data in error, original error:', error.message);
        throw error;
      }
    }
  }

  createCodeBlockChunks(section, startId) {
    const chunks = [];
    let chunkId = startId;
    
    for (const codeBlock of section.codeBlocks) {
      // Create a chunk for the entire code block
      chunks.push({
        id: `code_${chunkId++}`,
        content: codeBlock.content,
        title: section.title,
        type: 'code_block',
        section: section.title,
        level: section.level,
        language: codeBlock.language,
        raw: codeBlock.raw
      });
      
      // Create individual line chunks for short code blocks (like import statements)
      if (codeBlock.content.split('\n').length <= 5) {
        const lines = codeBlock.content.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        for (const line of lines) {
          chunks.push({
            id: `code_line_${chunkId++}`,
            content: line,
            title: section.title,
            type: 'code_line',
            section: section.title,
            level: section.level,
            language: codeBlock.language,
            raw: line
          });
        }
      }
    }
    
    return chunks;
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

  async saveChunksForInspection(chunks, filename) {
    try {
      const inspectionPath = path.join(process.cwd(), 'data', 'chunks-inspection');
      await fs.mkdir(inspectionPath, { recursive: true });
      
      // Group chunks by type for better analysis
      const chunksByType = {
        window: chunks.filter(c => c.type === 'window'),
        sentence_window: chunks.filter(c => c.type === 'sentence_window'),
        sentence_context: chunks.filter(c => c.type === 'sentence_context'),
        paragraph: chunks.filter(c => c.type === 'paragraph'),
        sentence: chunks.filter(c => c.type === 'sentence')
      };
      
      // Save detailed chunks info
      const chunksInfo = {
        filename: filename,
        totalChunks: chunks.length,
        chunksByType: Object.keys(chunksByType).reduce((acc, type) => {
          acc[type] = {
            count: chunksByType[type].length,
            chunks: chunksByType[type].map(chunk => ({
              id: chunk.id,
              content: chunk.content,
              position: chunk.position,
              windowSize: chunk.windowSize,
              sentenceCount: chunk.sentenceCount,
              originalSentence: chunk.originalSentence
            }))
          };
          return acc;
        }, {}),
        allChunks: chunks.map(chunk => ({
          id: chunk.id,
          type: chunk.type,
          content: chunk.content,
          position: chunk.position,
          windowSize: chunk.windowSize,
          sentenceCount: chunk.sentenceCount
        }))
      };
      
      const outputFile = path.join(inspectionPath, `${filename.replace('.md', '')}-chunks.json`);
      await fs.writeFile(outputFile, JSON.stringify(chunksInfo, null, 2));
      
      console.log(`📊 Chunks saved for inspection: ${outputFile}`);
      console.log(`📈 Total chunks: ${chunks.length}`);
      Object.keys(chunksByType).forEach(type => {
        if (chunksByType[type].length > 0) {
          console.log(`  - ${type}: ${chunksByType[type].length}`);
        }
      });
      
    } catch (error) {
      logger.error('Error saving chunks for inspection:', error);
    }
  }
}

module.exports = { DocumentProcessor };
