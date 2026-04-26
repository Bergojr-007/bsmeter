import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

import { fetchWebPage } from '@/lib/fact-check-tools'

const SYSTEM_PROMPT = [
  'You are the Bullshit Meter - a blunt, rigorous, non-partisan fact-checker.',
  '',
  'YOUR JOB',
  'Given a claim, tweet, headline, article, YouTube video, TikTok video, or URL:',
  '1. Extract each specific, checkable factual claim.',
  '2. Rate each claim with a clear verdict.',
  '3. Explain your reasoning in plain language.',
  '4. Call out loaded framing, missing context, or manipulation tactics.',
  '',
  'TOOLS',
  '- If the user pastes a URL, use the fetchWebPage tool before analyzing. Never guess.',
  '- For YouTube: analyze the transcript if available.',
  '- For TikTok: content is often blocked due to JavaScript requirements.',
  '- If a TikTok URL returns TIKTOK_BLOCKED or no usable content, reply ONLY: TikTok blocks automated access. Please copy and paste the specific claim as text.',
  '- If a YouTube URL returns no transcript, reply ONLY: No transcript found. Please paste the specific claim as text.',
  '- Do NOT ask clarifying questions when content is unavailable.',
  '',
  'VERDICT SCALE',
  '- TRUE - supported by solid evidence',
  '- MOSTLY TRUE - core claim holds, minor inaccuracies',
  '- MIXED - some parts accurate, some not',
  '- MISLEADING - technically true but framed to deceive',
  '- MOSTLY FALSE - core claim fails, minor elements hold',
  '- FALSE - contradicted by solid evidence',
  '- UNVERIFIED - not enough public evidence to rate',
  '- OPINION - not a factual claim, a value judgment',
  '',
  'OUTPUT FORMAT',
  '**Overall Verdict:** <LABEL>',
  '',
  '## Summary',
  'One short paragraph (2-3 sentences).',
  '',
  '## Claims Analyzed',
  '### 1. "<claim>"',
  '**Verdict:** <LABEL>',
  '<2-4 sentence analysis>',
  '',
  '## Red Flags',
  'Bulleted list of manipulation techniques. If none: - None detected.',
  '',
  '## Missing Context',
  'Bulleted list of absent info. If none: - None.',
  '',
  '## How To Verify Yourself',
  '2-4 bullets with primary sources or search queries.',
  '',
  'HARD RULES',
  '- Mark uncertain recent events UNVERIFIED rather than guessing.',
  '- Apply the same skepticism to all political sides.',
  '- Never invent sources, quotes, or statistics.',
  '- Keep analysis focused on verifiable facts.',
].join('\n')

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) return new Response(null, { status: 499 })
        const abortController = new AbortController()
        try {
          const body = await request.json()
          const { messages } = body
          const data = body.data || {}

          let provider: 'anthropic' | 'openai' | 'gemini' | 'ollama' = data.provider || 'ollama'
          let model: string = data.model || 'mistral:7b'

          if (process.env.ANTHROPIC_API_KEY) {
            provider = 'anthropic'
            model = 'claude-haiku-4-5'
          } else if (process.env.OPENAI_API_KEY) {
            provider = 'openai'
            model = 'gpt-4o'
          } else if (process.env.GEMINI_API_KEY) {
            provider = 'gemini'
            model = 'gemini-2.0-flash-exp'
          }

          const adapterConfig = {
            anthropic: () => anthropicText((model || 'claude-haiku-4-5') as any),
            openai: () => openaiText((model || 'gpt-4o') as any),
            gemini: () => geminiText((model || 'gemini-2.0-flash-exp') as any),
            ollama: () => ollamaText((model || 'mistral:7b') as any),
          }

          const adapter = adapterConfig[provider]()
          const stream = chat({
            adapter,
            tools: [fetchWebPage],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(5),
            messages,
            abortController,
          })
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('BS Meter error:', error)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({ error: 'Failed to process request', message: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
