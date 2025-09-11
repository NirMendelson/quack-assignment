const { marked } = require('marked');
const { logger } = require('../../utils/logger');

class MarkdownParser {
  constructor() {
    // Configure marked for better parsing
    marked.setOptions({
      gfm: true,
      breaks: true,
      pedantic: false,
      sanitize: false,
      smartLists: true,
      smartypants: false
    });
  }

  parseMarkdown(content) {
    try {
      // Parse markdown to HTML first
      const html = marked(content);
      
      // Extract structured content
      const sections = this.extractSections(html);
      const paragraphs = this.extractParagraphs(html);
      const lists = this.extractLists(html);
      const codeBlocks = this.extractCodeBlocks(content);
      
      return {
        sections,
        paragraphs,
        lists,
        codeBlocks,
        rawContent: content,
        htmlContent: html
      };
    } catch (error) {
      logger.error('Error parsing markdown:', error.message);
      throw error;
    }
  }

  extractSections(html) {
    const sections = [];
    const sectionRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    
    while ((match = sectionRegex.exec(html)) !== null) {
      const level = parseInt(match[1]);
      const title = this.stripHtmlTags(match[2]);
      
      sections.push({
        level,
        title,
        id: this.generateId(title)
      });
    }
    
    return sections;
  }

  extractParagraphs(html) {
    const paragraphs = [];
    const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let match;
    
    while ((match = paragraphRegex.exec(html)) !== null) {
      const content = this.stripHtmlTags(match[1]);
      if (content.trim()) {
        paragraphs.push({
          content: content.trim(),
          id: this.generateId(content.substring(0, 50))
        });
      }
    }
    
    return paragraphs;
  }

  extractLists(html) {
    const lists = [];
    const listRegex = /<(ul|ol)[^>]*>(.*?)<\/(ul|ol)>/gi;
    let match;
    
    while ((match = listRegex.exec(html)) !== null) {
      const listType = match[1];
      const content = this.stripHtmlTags(match[2]);
      
      lists.push({
        type: listType,
        content: content.trim(),
        id: this.generateId(content.substring(0, 50))
      });
    }
    
    return lists;
  }

  extractCodeBlocks(content) {
    const codeBlocks = [];
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];
      
      codeBlocks.push({
        language,
        code: code.trim(),
        id: this.generateId(code.substring(0, 50))
      });
    }
    
    return codeBlocks;
  }

  stripHtmlTags(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  generateId(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
}

module.exports = { MarkdownParser };
