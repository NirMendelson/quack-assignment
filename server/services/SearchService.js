const { SearchOrchestrator } = require('./search/SearchOrchestrator');

class SearchService {
  constructor() {
    this.searchOrchestrator = new SearchOrchestrator();
  }

  setDocumentProcessor(processor) {
    this.searchOrchestrator.setDocumentProcessor(processor);
  }

  async search(query, limit = 15) {
    return this.searchOrchestrator.search(query, limit);
  }
}

module.exports = { SearchService };