'use client'

import { Bot } from 'lucide-react'

export function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center space-x-2">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Quack Policy Agent</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered policy document Q&A
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
