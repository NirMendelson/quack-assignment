# Quack Policy Agent 🦆

## Goal

Build an **AI support agent** that can answer questions **strictly based on a policy document** provided as a `.md` file.  
- The agent **must always find the right information** when it exists in the file, even if the markdown is long, messy, or poorly structured.  
- If the answer **is not in the document**, the agent must **refuse politely** and say:  
  > "I could not find this in the policy."

This ensures users get answers grounded in the document — no hallucinations, no guessing.

---

## Why This Is Important

- **Policies are messy:** Real company policy docs are often long, unstructured, repetitive, and full of exceptions. A naive keyword search won't cover all use cases.  
- **Accuracy matters:** A customer support agent that invents answers is worse than no agent at all. Strict refusal is a must.  
- **Small input, big reliability:** Even though we only deal with a single markdown file, it contains everything. Our system must maximize recall (find every relevant fact) and minimize false answers.

---

## What We Build

We implement a **Retrieval-Augmented Generation (RAG) pipeline** optimized for small but unstructured markdown inputs:

1. **Indexing**  
   - Split the `.md` into both **sentences** (to capture small facts) and **paragraph chunks** (to preserve context).  
   - Store embeddings for each piece using **`voyage-3-large`** embeddings.  
   - Also build a lightweight keyword index for exact matches.

2. **Hybrid Retrieval**  
   - When a user asks a question:  
     - Run **keyword search** (good for exact terms like "refund").  
     - Run **embedding search** (good for paraphrases like "money back").  
   - Merge the results so we don't miss anything.

3. **Re-Ranking**  
   - Take the top ~15 snippets from retrieval.  
   - Use **Cohere Rerank** to select the **3–5 most relevant ones**.  
   - This removes noise and ensures only the best evidence is passed forward.

4. **Answering**  
   - Use **GPT-4.1** at **temperature 0** with strict prompts.  
   - The model answers strictly from the chosen snippets.  
   - It must **quote exact lines** from the markdown and add **citations** (chunk id + section).  
   - If no strong evidence is found, it refuses:  
     > "I could not find this in the policy."

---

## Why This Approach Works

- **Sentence-level + paragraph chunks** → catches both tiny facts and broader rules.  
- **Hybrid retrieval (keywords + embeddings)** → ensures high recall even on messy text.  
- **Cohere Rerank** → filters out irrelevant snippets, boosting precision.  
- **GPT-4.1 with temperature 0** → deterministic answers, grounded in text.  
- **Strict refusal logic** → guarantees we don't lie when the policy is silent.  
- **voyage-3-large embeddings** → top-tier retrieval accuracy for small corpora.

This combination is lightweight, reliable, and perfectly suited for **single-file policy QA**, where completeness and honesty are more important than scale.

---

## Example

- **Question:** *"What is the refund window?"*  
- **Answer:**  
  > Refunds are available only within **14 days of purchase** if no assets were downloaded.  
  > [c:c23 -> Payments > Refund Policy]  

- **Question:** *"Can I get a refund after 30 days?"*  
- **Answer:**  
  > I could not find this in the policy.

---

## Tech Stack

- **Next.js + Vercel AI SDK** → frontend & backend routes  
- **shadcn/ui** → upload button and chat UI  
- **Voyage `voyage-3-large`** → embeddings for indexing  
- **Cohere Rerank** → snippet re-ranking for precision  
- **GPT-4.1 @ temperature 0** → generation with strict prompts and refusal rule  
- **Custom retrieval logic** → hybrid search, strict refusal, citations  

---

## Quick Start

### Prerequisites

- Node.js 18+ 
- API keys for Voyage AI, Cohere, and OpenAI

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd quack-assignment
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your API keys:
   ```env
   VOYAGE_API_KEY=your_voyage_api_key_here
   COHERE_API_KEY=your_cohere_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   NODE_ENV=development
   LOG_LEVEL=info
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

### Usage

1. **Upload a policy document** using the file upload interface
2. **Wait for processing** (the system will index the document)
3. **Ask questions** about the policy in the chat interface
4. **Get answers** with citations and confidence scores

### Testing

Run the test suite to verify everything works:

```bash
npm test
```

This will:
- Process a sample policy document
- Run 10 test questions
- Generate a detailed report showing accuracy

---

## Project Structure

```
quack-assignment/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── upload/        # Document upload endpoint
│   │   └── query/         # Question answering endpoint
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── FileUpload.tsx    # File upload component
│   ├── ChatInterface.tsx # Chat interface
│   └── Header.tsx        # Header component
├── server/               # Backend services
│   ├── services/         # Core business logic
│   │   ├── DocumentProcessor.js  # Document indexing
│   │   ├── SearchService.js      # Hybrid search
│   │   └── AnswerService.js      # Answer generation
│   └── utils/            # Utilities
│       └── logger.js     # Logging configuration
├── tests/                # Test files
│   ├── test-documents/   # Sample policy documents
│   ├── test-questions.json # Test questions and answers
│   └── test-runner.js    # Test execution script
├── data/                 # Data storage
│   └── indexes/          # Persisted embeddings and indexes
└── lib/                  # Shared utilities
    └── utils.ts          # Utility functions
```

---

## Features

### ✅ Document Processing
- [x] Markdown parsing and chunking
- [x] Sentence-level and paragraph-level chunks
- [x] Voyage-3-large embeddings
- [x] BM25 keyword indexing with MiniSearch
- [x] JSON persistence for indexes

### ✅ Hybrid Search
- [x] Keyword search for exact matches
- [x] Semantic search with embeddings
- [x] Result merging and scoring
- [x] Cosine similarity calculation

### ✅ Answer Generation
- [x] Cohere Rerank for precision
- [x] GPT-4.1 with temperature 0
- [x] Strict refusal when no evidence
- [x] Citation generation
- [x] Confidence scoring

### ✅ User Interface
- [x] File upload with drag & drop
- [x] Chat interface with message history
- [x] Citation display
- [x] Confidence indicators
- [x] Responsive design

### ✅ Testing & Quality
- [x] Automated test suite
- [x] Sample test documents
- [x] Accuracy evaluation
- [x] Error handling and logging
- [x] TypeScript support

---

## API Endpoints

### POST `/api/upload`
Upload and process a markdown policy document.

**Request:**
- `multipart/form-data` with `document` field

**Response:**
```json
{
  "success": true,
  "documentName": "policy.md",
  "chunksCount": 45,
  "message": "Document processed and indexed successfully"
}
```

### POST `/api/query`
Ask a question about the uploaded policy.

**Request:**
```json
{
  "question": "What is the refund policy?"
}
```

**Response:**
```json
{
  "answer": "Refunds are available only within 14 days of purchase if no assets were downloaded.",
  "citations": [
    {
      "id": "p_23",
      "section": "Payment & Billing",
      "chunkIndex": 1
    }
  ],
  "confidence": 0.95,
  "chunks": [...]
}
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VOYAGE_API_KEY` | Voyage AI API key for embeddings | Yes |
| `COHERE_API_KEY` | Cohere API key for reranking | Yes |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4.1 | Yes |
| `NODE_ENV` | Environment (development/production) | No |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | No |

### File Limits

- Maximum file size: 10MB
- Supported formats: `.md` (markdown)
- Processing time: ~2-5 seconds per document

---

## Troubleshooting

### Common Issues

1. **"I could not find this in the policy" for everything**
   - Check if document was uploaded successfully
   - Verify API keys are correct
   - Check browser console for errors

2. **Slow processing**
   - Large documents take longer to process
   - Check internet connection for API calls
   - Monitor logs for errors

3. **Poor answer quality**
   - Try rephrasing questions
   - Check if information exists in the document
   - Verify document was processed correctly

### Debug Mode

Enable debug logging by setting `LOG_LEVEL=debug` in your `.env` file.

---

## Contributing

1. Follow the existing code structure
2. Add tests for new features
3. Update documentation
4. Run the test suite before submitting

---

## License

MIT License - see LICENSE file for details.
