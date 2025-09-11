import natural from 'natural';
import { logger } from '../../utils/logger.js';

class ChunkingService {
  constructor() {
    // Only use the tokenizers we need - avoid loading classifiers that cause webpack issues
    this.sentenceTokenizer = new natural.SentenceTokenizer();
    this.wordTokenizer = new natural.WordTokenizer();
  }

  createChunks(parsedContent) {
    const chunks = [];
    const content = parsedContent.rawContent;
    
    // Create different types of chunks
    const sentenceChunks = this.createSentenceChunks(content);
    const windowChunks = this.createWindowChunks(content);
    const paragraphChunks = this.createParagraphChunks(content);
    const codeChunks = this.createCodeChunks(parsedContent.codeBlocks);
    
    // Combine all chunks
    chunks.push(...sentenceChunks, ...windowChunks, ...paragraphChunks, ...codeChunks);
    
    // Add metadata to each chunk
    chunks.forEach((chunk, index) => {
      chunk.id = `${chunk.type}_${index}`;
      chunk.position = index;
    });
    
    logger.info(`Created ${chunks.length} chunks: ${sentenceChunks.length} sentences, ${windowChunks.length} windows, ${paragraphChunks.length} paragraphs, ${codeChunks.length} code blocks`);
    
    return chunks;
  }

  createSentenceChunks(content) {
    const sentences = this.sentenceTokenizer.tokenize(content);
    const chunks = [];
    
    sentences.forEach((sentence, index) => {
      if (sentence.trim().length > 10) { // Filter out very short sentences
        chunks.push({
          type: 'sentence',
          content: sentence.trim(),
          originalSentence: sentence.trim(),
          position: index
        });
      }
    });
    
    return chunks;
  }

  createWindowChunks(content, windowSize = 3) {
    const sentences = this.sentenceTokenizer.tokenize(content);
    const chunks = [];
    
    for (let i = 0; i < sentences.length - windowSize + 1; i++) {
      const windowSentences = sentences.slice(i, i + windowSize);
      const windowContent = windowSentences.join(' ').trim();
      
      if (windowContent.length > 50) { // Filter out very short windows
        chunks.push({
          type: 'window',
          content: windowContent,
          originalSentence: windowContent,
          position: i
        });
      }
    }
    
    return chunks;
  }

  createParagraphChunks(content) {
    const paragraphs = content.split(/\n\s*\n/);
    const chunks = [];
    
    paragraphs.forEach((paragraph, index) => {
      const trimmed = paragraph.trim();
      if (trimmed.length > 20) { // Filter out very short paragraphs
        chunks.push({
          type: 'paragraph',
          content: trimmed,
          originalSentence: trimmed,
          position: index
        });
      }
    });
    
    return chunks;
  }

  createCodeChunks(codeBlocks) {
    const chunks = [];
    
    codeBlocks.forEach((block, index) => {
      if (block.code.trim().length > 10) {
        chunks.push({
          type: 'code_block',
          content: block.code.trim(),
          language: block.language,
          originalSentence: block.code.trim(),
          position: index
        });
      }
    });
    
    return chunks;
  }

  createSentenceContextChunks(content, contextSize = 1) {
    const sentences = this.sentenceTokenizer.tokenize(content);
    const chunks = [];
    
    sentences.forEach((sentence, index) => {
      if (sentence.trim().length > 10) {
        const start = Math.max(0, index - contextSize);
        const end = Math.min(sentences.length, index + contextSize + 1);
        const contextSentences = sentences.slice(start, end);
        const contextContent = contextSentences.join(' ').trim();
        
        chunks.push({
          type: 'sentence_context',
          content: contextContent,
          originalSentence: sentence.trim(),
          position: index
        });
      }
    });
    
    return chunks;
  }
}

export { ChunkingService };
