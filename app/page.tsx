'use client'

import { useState } from 'react'
import { FileUpload } from '@/components/FileUpload'
import { ChatInterface } from '@/components/ChatInterface'

export default function Home() {
  const [documentLoaded, setDocumentLoaded] = useState(false)
  const [documentName, setDocumentName] = useState('')

  const handleDocumentLoaded = (name: string) => {
    setDocumentName(name)
    setDocumentLoaded(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 pt-16 pb-8">
        {!documentLoaded ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4">Quack Home Assignment 🦆</h1>
              <p className="text-lg text-muted-foreground mb-8">
                Upload a policy document and ask questions. The agent will answer strictly based on the document content.
              </p>
            </div>
            <FileUpload onDocumentLoaded={handleDocumentLoaded} />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-2">
                Policy Document: {documentName}
              </h2>
              <p className="text-muted-foreground">
                Ask questions about this policy document. The agent will provide answers with citations.
              </p>
            </div>
            <ChatInterface />
          </div>
        )}
      </main>
    </div>
  )
}
