import { NextRequest, NextResponse } from 'next/server'
import { DocumentProcessor } from '@/server/services/DocumentProcessor'
import { SearchService } from '@/server/services/SearchService'
import { AnswerService } from '@/server/services/AnswerService'
import { logger } from '@/server/utils/logger'

// Initialize services
const documentProcessor = new DocumentProcessor()
const searchService = new SearchService()
const answerService = new AnswerService()

// Load existing indexes on startup
documentProcessor.loadIndexes().then(() => {
  searchService.setDocumentProcessor(documentProcessor)
  logger.info('Services initialized and indexes loaded')
}).catch(error => {
  logger.warn('Could not load indexes on startup:', error)
})

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json()
    
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    logger.info(`Processing query: ${question}`)
    
    // Search for relevant chunks
    const searchResults = await searchService.search(question)
    
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
    logger.error('Error processing query:', error)
    return NextResponse.json({ 
      error: 'Failed to process query',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
