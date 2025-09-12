// Simple in-memory state management for serverless functions
// In production, you'd want to use Redis, Vercel KV, or a database

interface AppState {
  searchService: any | null;
  documentProcessor: any | null;
  isInitialized: boolean;
}

class StateManager {
  private static instance: StateManager;
  private state: AppState = {
    searchService: null,
    documentProcessor: null,
    isInitialized: false
  };

  private constructor() {}

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  public getState(): AppState {
    return this.state;
  }

  public setSearchService(service: any): void {
    this.state.searchService = service;
  }

  public setDocumentProcessor(processor: any): void {
    this.state.documentProcessor = processor;
  }

  public setInitialized(initialized: boolean): void {
    this.state.isInitialized = initialized;
  }

  public reset(): void {
    this.state = {
      searchService: null,
      documentProcessor: null,
      isInitialized: false
    };
  }
}

export const stateManager = StateManager.getInstance();
