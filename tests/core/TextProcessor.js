class TextProcessor {
  constructor() {
    // No dependencies needed for text processing
  }

  // Helper methods for robust text processing
  normalizeSmartQuotes(s) {
    if (!s) return '';
    return s
      // real smart quotes to straight
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // em/en dashes → hyphen
      .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
      // non-breaking and thin spaces → normal space
      .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  }
  
  stripOuterQuotesAndItalics(s) {
    if (!s) return '';
    let t = s.trim();
    // strip italics
    t = t.replace(/^\*+/, '').replace(/\*+$/, '');
    // strip BOTH straight and smart quotes at ends
    t = t.replace(/^["""]+/, '').replace(/["""]+$/, '');
    return t.trim();
  }
  
  normalizeForMatch(s) {
    if (!s) return '';
    return this.stripOuterQuotesAndItalics(this.normalizeSmartQuotes(s))
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  stripMarkdownQuote(line) {
    let t = line.replace(/^>\s*/, '');
    t = this.normalizeSmartQuotes(t).trim();
    t = t.replace(/^\*+/, '').replace(/\*+$/, '').trim();
    t = t.replace(/^"+/, '').replace(/"+$/, '').trim();
    t = t.replace(/^`+/, '').replace(/`+$/, '').trim();
    return t;
  }

  splitIntoHalves(text) {
    const words = this.normalizeSmartQuotes(text).trim().split(/\s+/);
    const midPoint = Math.floor(words.length / 2);
    
    return [
      words.slice(0, midPoint).join(' '),
      words.slice(midPoint).join(' ')
    ];
  }

  findChunksWithText(chunks, searchText) {
    const needle = this.normalizeForMatch(searchText);
  
    return chunks.filter(chunk => {
      const hay = this.normalizeForMatch(chunk.content);
      return hay.includes(needle);
    });
  }

  extractQuotedTextFromQA(expectedAnswer, qaContent) {
    if (!qaContent) return null;
    const lines = this.normalizeSmartQuotes(qaContent).split('\n');
    let idx = lines.findIndex(l => this.normalizeSmartQuotes(l).includes(this.normalizeSmartQuotes(expectedAnswer)));
    if (idx === -1) return null;

    // collect up to 5 subsequent blockquote lines as one quote blob
    const pieces = [];
    for (let i = idx; i < Math.min(idx + 8, lines.length); i++) {
      const t = this.normalizeSmartQuotes(lines[i]).trim();
      if (t.startsWith('>')) pieces.push(this.stripMarkdownQuote(t));
    }
    const joined = pieces.join(' ').trim();
    return joined || null;
  }

  extractQuotedText(expectedAnswer) {
    // Look for text in quotes with asterisks (more flexible pattern)
    // Pattern: > *"text"* (the quoted text is between the quotes)
    const quoteMatch = expectedAnswer.match(/>\s*\*\s*[""]([^""]+)[""]\s*\*/);
    if (quoteMatch) {
      return quoteMatch[1].trim();
    }
    
    // Look for text in backticks
    const backtickMatch = expectedAnswer.match(/`([^`]+)`/);
    if (backtickMatch) {
      return backtickMatch[1].trim();
    }
    
    return null;
  }

  extractKeywords(text) {
    // Extract meaningful keywords from text for matching
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .map(word => word.toLowerCase());
  }

  checkContradiction(expected, actual) {
    // Check for contradictory information between expected and actual answers
    const contradictions = [
      ['yes', 'no'],
      ['can', 'cannot'],
      ['allowed', 'not allowed'],
      ['available', 'not available'],
      ['possible', 'not possible']
    ];
    
    for (const [pos, neg] of contradictions) {
      const expectedHasPos = expected.toLowerCase().includes(pos);
      const actualHasNeg = actual.toLowerCase().includes(neg);
      const expectedHasNeg = expected.toLowerCase().includes(neg);
      const actualHasPos = actual.toLowerCase().includes(pos);
      
      if ((expectedHasPos && actualHasNeg) || (expectedHasNeg && actualHasPos)) {
        return true;
      }
    }
    
    return false;
  }

  cleanAnswerText(text) {
    // Remove citation patterns and formatting from the generated answer
    return text.replace(/\[c:\d+\s*->[^\]]+\]/g, '')
      // Remove bold markers around quoted text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // Clean up extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = { TextProcessor };
