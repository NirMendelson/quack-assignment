import { NextRequest, NextResponse } from 'next/server'
import { DocumentProcessor } from '../../../server/services/DocumentProcessor'
import { logger } from '../../../server/utils/logger'

const documentProcessor = new DocumentProcessor()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('document') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.type !== 'text/markdown' && !file.name.endsWith('.md')) {
      return NextResponse.json({ error: 'Only markdown files are allowed' }, { status: 400 })
    }

    logger.info(`Processing uploaded file: ${file.name}`)
    
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    // Read the file content
    const fileContent = await file.text()
    
    console.log('File content length:', fileContent.length);
    console.log('File content preview:', fileContent.substring(0, 200) + '...');
    
    // Process the document
    const processedDoc = await documentProcessor.processDocument(fileContent, file.name)
    
    // Initialize search service with the processed document
    const { SearchService } = require('../../../server/services/SearchService')
    const searchService = new SearchService()
    searchService.setDocumentProcessor(documentProcessor)
    
    // Store the search service globally (in a real app, you'd use a proper state management solution)
    global.searchService = searchService
    
    logger.info(`Document processed successfully: ${processedDoc.chunks.length} chunks created`)
    
    return NextResponse.json({
      success: true,
      documentName: file.name,
      chunksCount: processedDoc.chunks.length,
      message: 'Document processed and indexed successfully'
    })
    
  } catch (error) {
    logger.error('Error processing document:', error.message)
    return NextResponse.json({ 
      error: 'Failed to process document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
