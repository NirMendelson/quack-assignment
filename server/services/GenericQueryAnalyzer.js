const natural = require('natural');

class GenericQueryAnalyzer {
  constructor() {
    // Initialize stemmer for better term matching
    this.stemmer = natural.PorterStemmer;
    
    // Common question patterns for different types
    this.questionPatterns = {
      factoid: [
        /^what (is|are|was|were)/i,
        /^how (should|can|could|do|does|did)/i,
        /^when (should|can|could|do|does|did)/i,
        /^where (should|can|could|do|does|did)/i,
        /^who (should|can|could|do|does|did)/i,
        /^which/i,
        /^why (should|can|could|do|does|did)/i
      ],
      process: [
        /^how to/i,
        /^how do you/i,
        /^steps to/i,
        /^process of/i,
        /^procedure for/i
      ],
      policy: [
        /^policy/i,
        /^rules/i,
        /^guidelines/i,
        /^requirements/i,
        /^terms/i,
        /^conditions/i
      ],
      comparison: [
        /^difference between/i,
        /^compare/i,
        /^vs/i,
        /^versus/i
      ]
    };
  }

  analyzeQuery(query) {
    const analysis = {
      originalQuery: query,
      questionType: this.identifyQuestionType(query),
      keyTerms: this.extractKeyTerms(query),
      tokenBuckets: this.createTokenBuckets(query),
      variations: this.generateQueryVariations(query),
      exactPhrases: this.extractExactPhrases(query)
    };

    return analysis;
  }

  identifyQuestionType(query) {
    const lowerQuery = query.toLowerCase();
    
    for (const [type, patterns] of Object.entries(this.questionPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerQuery)) {
          return type;
        }
      }
    }
    
    // Default to factoid if no pattern matches
    return 'factoid';
  }

  extractKeyTerms(query) {
    // Tokenize and clean the query
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(query.toLowerCase());
    
    // Remove stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
    ]);
    
    const keyTerms = tokens
      .filter(token => !stopWords.has(token))
      .filter(token => token.length > 2) // Remove very short tokens
      .map(token => this.stemmer.stem(token)); // Stem for better matching
    
    return [...new Set(keyTerms)]; // Remove duplicates
  }

  createTokenBuckets(query) {
    const buckets = {
      primary: new Set(),
      secondary: new Set(),
      context: new Set()
    };
    
    const keyTerms = this.extractKeyTerms(query);
    const questionType = this.identifyQuestionType(query);
    
    // Categorize terms based on importance and question type
    keyTerms.forEach(term => {
      // Primary terms: most important for the query
      if (this.isPrimaryTerm(term, questionType)) {
        buckets.primary.add(term);
      }
      // Secondary terms: supporting terms
      else if (this.isSecondaryTerm(term, questionType)) {
        buckets.secondary.add(term);
      }
      // Context terms: general context
      else {
        buckets.context.add(term);
      }
    });
    
    return {
      primary: Array.from(buckets.primary),
      secondary: Array.from(buckets.secondary),
      context: Array.from(buckets.context)
    };
  }

  isPrimaryTerm(term, questionType) {
    // Terms that are most likely to appear in the answer
    const primaryPatterns = {
      factoid: [
        /certificate/, /license/, /claim/, /copyright/, /project/, /account/,
        /refund/, /cancel/, /subscription/, /download/, /billing/, /payment/,
        /support/, /contact/, /email/, /phone/, /chat/, /response/, /time/
      ],
      process: [
        /step/, /process/, /procedure/, /method/, /way/, /how/, /guide/,
        /login/, /sign/, /register/, /create/, /generate/, /download/
      ],
      policy: [
        /policy/, /rule/, /guideline/, /requirement/, /term/, /condition/,
        /allow/, /permit/, /restrict/, /limit/, /prohibit/, /forbid/
      ],
      comparison: [
        /difference/, /compare/, /versus/, /vs/, /better/, /best/, /worse/, /worst/
      ]
    };
    
    const patterns = primaryPatterns[questionType] || primaryPatterns.factoid;
    return patterns.some(pattern => pattern.test(term));
  }

  isSecondaryTerm(term, questionType) {
    // Terms that provide context but aren't the main focus
    const secondaryPatterns = [
      /customer/, /user/, /client/, /account/, /subscription/, /plan/,
      /feature/, /function/, /option/, /setting/, /preference/,
      /time/, /date/, /day/, /month/, /year/, /hour/, /minute/,
      /file/, /document/, /data/, /content/, /media/, /video/, /audio/
    ];
    
    return secondaryPatterns.some(pattern => pattern.test(term));
  }

  generateQueryVariations(query) {
    const variations = [query];
    
    // Add variations with different word orders
    const words = query.split(' ');
    if (words.length > 2) {
      // Try different word combinations
      for (let i = 0; i < words.length - 1; i++) {
        const variation = words.slice(i).join(' ');
        if (variation.length > 10) {
          variations.push(variation);
        }
      }
    }
    
    // Add stemmed variations
    const keyTerms = this.extractKeyTerms(query);
    if (keyTerms.length > 0) {
      variations.push(keyTerms.join(' '));
    }
    
    return [...new Set(variations)]; // Remove duplicates
  }

  extractExactPhrases(query) {
    // Extract phrases that should be matched exactly
    const phrases = [];
    
    // Look for quoted phrases
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        phrases.push(match.replace(/"/g, ''));
      });
    }
    
    // Look for common phrase patterns
    const phrasePatterns = [
      /license certificate/i,
      /per project/i,
      /copyright claim/i,
      /refund policy/i,
      /subscription plan/i,
      /download limit/i,
      /support team/i,
      /billing page/i,
      /account dashboard/i
    ];
    
    phrasePatterns.forEach(pattern => {
      const match = query.match(pattern);
      if (match) {
        phrases.push(match[0]);
      }
    });
    
    return phrases;
  }

  // Method to check if a chunk matches the token buckets
  matchesTokenBuckets(chunk, tokenBuckets) {
    const content = chunk.content.toLowerCase();
    const stemmedContent = this.stemmer.stem(content);
    
    let primaryMatches = 0;
    let secondaryMatches = 0;
    let contextMatches = 0;
    
    // Check primary bucket matches
    tokenBuckets.primary.forEach(term => {
      if (stemmedContent.includes(term)) {
        primaryMatches++;
      }
    });
    
    // Check secondary bucket matches
    tokenBuckets.secondary.forEach(term => {
      if (stemmedContent.includes(term)) {
        secondaryMatches++;
      }
    });
    
    // Check context bucket matches
    tokenBuckets.context.forEach(term => {
      if (stemmedContent.includes(term)) {
        contextMatches++;
      }
    });
    
    // Calculate match score
    const totalTerms = tokenBuckets.primary.length + tokenBuckets.secondary.length + tokenBuckets.context.length;
    const totalMatches = primaryMatches + secondaryMatches + contextMatches;
    
    return {
      matches: totalMatches > 0,
      score: totalMatches / totalTerms,
      primaryMatches,
      secondaryMatches,
      contextMatches,
      totalMatches
    };
  }
}

module.exports = { GenericQueryAnalyzer };
