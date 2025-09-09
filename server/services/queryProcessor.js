const { logger } = require('../utils/logger');

class QueryProcessor {
  constructor() {
    // Domain-specific synonyms and related terms
    this.synonyms = {
      'copyright': ['license', 'rights', 'permission', 'legal', 'intellectual property'],
      'claims': ['disputes', 'issues', 'problems', 'conflicts', 'violations'],
      'projects': ['work', 'content', 'productions', 'creations', 'assignments'],
      'license': ['permission', 'rights', 'certificate', 'authorization', 'clearance'],
      'certificate': ['document', 'proof', 'evidence', 'record', 'paperwork'],
      'generate': ['create', 'produce', 'make', 'obtain', 'download'],
      'per project': ['for each project', 'project-specific', 'individual project', 'separate project'],
      'avoid': ['prevent', 'stop', 'eliminate', 'reduce', 'minimize'],
      'subscription': ['account', 'membership', 'plan', 'service'],
      'cancel': ['terminate', 'end', 'stop', 'discontinue', 'close'],
      'download': ['get', 'obtain', 'acquire', 'retrieve', 'fetch'],
      'track': ['song', 'music', 'audio', 'sound', 'composition'],
      'footage': ['video', 'clip', 'film', 'recording', 'media'],
      'client': ['customer', 'customer work', 'commercial', 'business'],
      'broadcast': ['television', 'tv', 'streaming', 'airing', 'transmission']
    };

    // Technical terms that should be boosted
    this.technicalTerms = [
      'license certificate', 'per project', 'copyright claims', 'subscription',
      'download', 'track', 'footage', 'broadcast', 'streaming', 'enterprise',
      'royalty-free', 'model release', 'property release', 'metadata'
    ];

    // Common question patterns
    this.questionPatterns = {
      'how': ['how to', 'how can', 'how do', 'how should'],
      'what': ['what is', 'what are', 'what does', 'what if'],
      'can': ['can i', 'can we', 'can you', 'can customers'],
      'where': ['where to', 'where can', 'where do', 'where is'],
      'when': ['when to', 'when can', 'when do', 'when should']
    };
  }

  processQuery(originalQuery) {
    logger.info(`Processing query: ${originalQuery}`);
    
    const processed = {
      original: originalQuery,
      expanded: this.expandQuery(originalQuery),
      exactPhrases: this.extractExactPhrases(originalQuery),
      technicalTerms: this.extractTechnicalTerms(originalQuery),
      questionType: this.identifyQuestionType(originalQuery),
      variations: this.generateQueryVariations(originalQuery)
    };

    logger.info(`Query processed: ${processed.expanded.length} expanded terms, ${processed.variations.length} variations`);
    return processed;
  }

  expandQuery(query) {
    const words = query.toLowerCase().split(/\s+/);
    const expanded = new Set([query.toLowerCase()]);
    
    // Add synonyms for each word
    words.forEach(word => {
      if (this.synonyms[word]) {
        this.synonyms[word].forEach(synonym => {
          expanded.add(synonym);
          // Add combinations with synonyms
          expanded.add(query.toLowerCase().replace(word, synonym));
        });
      }
    });

    // Add related technical terms
    this.technicalTerms.forEach(term => {
      if (query.toLowerCase().includes(term.split(' ')[0])) {
        expanded.add(term);
      }
    });

    return Array.from(expanded);
  }

  extractExactPhrases(query) {
    const phrases = [];
    const words = query.toLowerCase().split(/\s+/);
    
    // Extract 2-4 word phrases
    for (let i = 0; i < words.length - 1; i++) {
      for (let j = 2; j <= Math.min(4, words.length - i); j++) {
        const phrase = words.slice(i, i + j).join(' ');
        phrases.push(phrase);
      }
    }
    
    return phrases;
  }

  extractTechnicalTerms(query) {
    const found = [];
    this.technicalTerms.forEach(term => {
      if (query.toLowerCase().includes(term.toLowerCase())) {
        found.push(term);
      }
    });
    return found;
  }

  identifyQuestionType(query) {
    const lowerQuery = query.toLowerCase();
    for (const [type, patterns] of Object.entries(this.questionPatterns)) {
      if (patterns.some(pattern => lowerQuery.includes(pattern))) {
        return type;
      }
    }
    return 'general';
  }

  generateQueryVariations(query) {
    const variations = [query];
    const words = query.toLowerCase().split(/\s+/);
    
    // Generate variations by replacing key terms
    const keyTerms = ['copyright', 'license', 'project', 'certificate', 'generate', 'avoid'];
    
    keyTerms.forEach(term => {
      if (words.includes(term) && this.synonyms[term]) {
        this.synonyms[term].forEach(synonym => {
          const variation = query.toLowerCase().replace(term, synonym);
          variations.push(variation);
        });
      }
    });

    // Add technical term combinations
    if (words.includes('license') && words.includes('certificate')) {
      variations.push('license certificate per project');
      variations.push('generate license certificate');
    }
    
    if (words.includes('copyright') && words.includes('claims')) {
      variations.push('avoid copyright claims');
      variations.push('prevent copyright issues');
    }

    return [...new Set(variations)]; // Remove duplicates
  }

  calculateRelevanceScore(chunk, processedQuery) {
    let score = 0;
    const content = chunk.content.toLowerCase();
    
    // Exact phrase matching (highest priority)
    processedQuery.exactPhrases.forEach(phrase => {
      if (content.includes(phrase)) {
        score += 10 * phrase.split(' ').length; // Longer phrases get higher scores
      }
    });

    // Technical term density
    processedQuery.technicalTerms.forEach(term => {
      if (content.includes(term.toLowerCase())) {
        score += 5;
      }
    });

    // Expanded term matching
    processedQuery.expanded.forEach(term => {
      if (content.includes(term)) {
        score += 2;
      }
    });

    // Question type alignment
    if (processedQuery.questionType === 'how' && content.includes('how to')) {
      score += 3;
    }
    if (processedQuery.questionType === 'can' && content.includes('can')) {
      score += 3;
    }

    // Boost for policy-specific language
    const policyTerms = ['must', 'should', 'required', 'policy', 'terms', 'conditions'];
    policyTerms.forEach(term => {
      if (content.includes(term)) {
        score += 1;
      }
    });

    return score;
  }
}

module.exports = { QueryProcessor };
