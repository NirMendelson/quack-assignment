import { NextRequest, NextResponse } from 'next/server'
import { DocumentProcessor } from '../../../server/services/DocumentProcessor.js'
import { SearchService } from '../../../server/services/SearchService.js'
import { AnswerService } from '../../../server/services/AnswerService.js'
import { logger } from '../../../server/utils/logger.js'
import { stateManager } from '../../../lib/state'

// Initialize services
const answerService = new AnswerService()

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json()
    
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Check if search service is available
    const state = stateManager.getState()
    if (!state.searchService || !state.isInitialized) {
      return NextResponse.json({ 
        error: 'No document uploaded yet. Please upload a document first.' 
      }, { status: 400 })
    }

    logger.info(`Processing query: ${question}`)
    
    // Search for relevant chunks
    const searchResults = await state.searchService.search(question)
    
    // Generate answer
    const answer = await answerService.generateAnswer(question, searchResults)
    
    logger.info(`Answer generated successfully`)
    
    return NextResponse.json({
      answer: answer.text,
      citations: answer.citations,
      confidence: answer.confidence,
      chunks: searchResults.map((r: any) => ({
        id: r.id,
        content: r.content,
        score: r.score
      }))
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Error processing query:', errorMessage)
    return NextResponse.json({ 
      error: 'Failed to process query',
      details: errorMessage
    }, { status: 500 })
  }
}
