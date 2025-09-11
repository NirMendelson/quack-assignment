# Quack Policy Agent

A Retrieval-Augmented Generation (RAG) system that answers questions about policy documents using Claude Sonnet 4 and Voyage 3 embeddings via the Vercel AI SDK. The system combines semantic search, keyword search, and exact phrase matching to find relevant information and generate accurate answers.

## Workflow

### Document Processing Workflow
1. **Upload**: User uploads a markdown policy document via web interface
2. **Parse**: System parses and cleans the markdown content
3. **Chunk**: Document is split into semantic chunks with 20% overlap
4. **Embed**: Each chunk is converted to Voyage 3 embeddings for semantic search
5. **Index**: Keywords are extracted and indexed using BM25 algorithm
6. **Store**: Embeddings and indexes are saved for fast retrieval

### Query Processing Workflow
1. **Receive**: User submits a question through the chat interface
2. **Search**: System performs hybrid search across three methods:
   - Semantic search using Voyage 3 embeddings
   - Keyword search using BM25 algorithm
   - Exact phrase search for precise matches
3. **Fuse**: Results are combined using Reciprocal Rank Fusion (RRF)
4. **Retrieve**: Top relevant chunks are retrieved with context
5. **Generate**: Claude Sonnet 4 generates answer using retrieved context
6. **Cite**: System tracks citations and calculates confidence scores
7. **Respond**: Answer is returned with citations and confidence metrics

### Testing Workflow
1. **Load**: Test documents and expected Q&A pairs are loaded
2. **Process**: Each test question goes through the query workflow
3. **Evaluate**: Claude Sonnet 4 evaluates generated answers against expected answers
4. **Score**: System calculates accuracy metrics and performance statistics
5. **Report**: Comprehensive test results are generated and saved

## Architecture

### Core Components

1. **Document Processing Pipeline**
   - Markdown parsing and cleaning
   - Intelligent chunking with sentence/paragraph boundaries
   - Semantic embeddings using Voyage AI
   - Keyword indexing with MiniSearch

2. **Search Orchestration**
   - Semantic search using Voyage 3 embeddings for conceptual queries
   - BM25 keyword search for specific terms
   - Exact phrase search for precise matches
   - Reciprocal Rank Fusion (RRF) for result combination

3. **Answer Generation**
   - Context-aware prompting with Claude Sonnet 4
   - Citation tracking and confidence scoring
   - Response validation and error handling

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Anthropic API key
- Voyage AI API key


### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd quack-assignment
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Anthropic API Key (required)
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   
   # Alternative: CLAUDE_API_KEY (fallback)
   CLAUDE_API_KEY=your_claude_api_key_here
   
   # Voyage AI API Key (for Voyage 3 embeddings)
   VOYAGE_API_KEY=your_voyage_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`

## Usage

### Web Interface

1. **Upload a Policy Document**
   - Navigate to the web interface
   - Click "Upload Document" and select a markdown file
   - Wait for processing to complete (indexing may take a few minutes)

2. **Ask Questions**
   - Type your question in the chat interface
   - The system will search the document and generate an answer
   - Answers include citations and confidence scores

### Automated Testing

Run the automated test suite to evaluate system performance:

```bash
# Run all tests with LLM evaluation
npm run test:auto

# Run specific test files
node tests/automated-test-runner.js --test test1
node tests/automated-test-runner.js --test test2
```

The test runner will:
- Load test documents and questions
- Generate answers using Claude Sonnet 4
- Evaluate accuracy using Claude Sonnet 4
- Generate detailed performance reports

## Test Documents

The system includes a test document in the `data/` directory:

- `test1/` - Basic policy document with refund policies

The test includes:
- Source document (`test1.md`)
- Question-answer pairs (`test1_q&a.md`)
- Expected answers for evaluation

## Approach & Methodology

### Search Strategy

The system uses a **hybrid search approach** combining multiple retrieval methods:

1. **Semantic Search**: Uses Voyage 3 embeddings to find conceptually similar content
2. **Keyword Search**: BM25 algorithm for term-based matching
3. **Exact Phrase Search**: Precise string matching for specific quotes
4. **Reciprocal Rank Fusion**: Combines results from all methods with weighted scoring

## Assumptions & Limitations

### Assumptions

1. **Document Format**: Optimized for markdown do

### Limitations

1. **Real-time Updates**: Documents must be re-uploaded to reflect changes
2. **Complex Reasoning**: May struggle with multi-step logical inference

