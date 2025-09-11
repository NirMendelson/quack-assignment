import { NextRequest, NextResponse } from 'next/server'
import { DocumentProcessor } from '../../../server/services/DocumentProcessor.js'
import { SearchService } from '../../../server/services/SearchService.js'
import { AnswerService } from '../../../server/services/AnswerService.js'
import { logger } from '../../../server/utils/logger.js'

// Initialize services
const documentProcessor = new DocumentProcessor()
const searchService = new SearchService()
const answerService = new AnswerService()

// Load existing indexes on startup
documentProcessor.loadIndexes().then(() => {
  searchService.setDocumentProcessor(documentProcessor)
  logger.info('Services initialized and indexes loaded')
}).catch(error => {
  // This is expected when starting fresh - indexes will be created when document is uploaded
  logger.info('No existing indexes to load on startup - will create new ones when document is uploaded')
})

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json()
    
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Check if search service is available
    if (!global.searchService) {
      return NextResponse.json({ 
        error: 'No document uploaded yet. Please upload a document first.' 
      }, { status: 400 })
    }

    logger.info(`Processing query: ${question}`)
    
    // Search for relevant chunks
    const searchResults = await global.searchService.search(question)
    
    // Generate answer
    const answer = await answerService.generateAnswer(question, searchResults)
    
    logger.info(`Answer generated successfully`)
    
    return NextResponse.json({
      answer: answer.text,
      citations: answer.citations,
      confidence: answer.confidence,
      chunks: searchResults.map(r => ({
        id: r.id,
        content: r.content,
        score: r.score
      }))
    })
    
  } catch (error) {
    logger.error('Error processing query:', error.message)
    return NextResponse.json({ 
      error: 'Failed to process query',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
