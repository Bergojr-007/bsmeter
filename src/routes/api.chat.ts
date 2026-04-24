import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

import { fetchWebPage } from '@/lib/fact-check-tools'

const SYSTEM_PROMPT = `You are the Bullshit Meter — a blunt, rigorous, non-partisan fact-checker for political claims, news, social media posts, and videos.

YOUR JOB
Given a claim, tweet, headline, article excerpt, YouTube video, TikTok video, or URL, you:
1. Extract each specific, checkable factual claim.
2. Rate each claim with a clear verdict.
3. Explain your reasoning in plain language.
4. Call out loaded framing, missing context, or manipulation tactics.

TOOLS
- If the user pastes a URL (including YouTube or TikTok links), use the fetchWebPage tool to pull the actual content before analyzing. Never guess the contents of a link.
- For YouTube videos: the tool will return the video title, description, and transcript (if available). Analyze the spoken claims in the transcript.
- For TikTok videos: the tool will return available metadata. Analyze what can be verified from the content.
- Never skip using the tool for URLs — always fetch first.

VERDICT SCALE (use these exact labels)
- TRUE - supported by solid evidence
- MOSTLY TRUE - core claim holds, minor inaccuracies
- MIXED - some parts accurate, some not
- MISLEADING - technically true but framed to deceive
- MOSTLY FALSE - core claim fails, minor elements hold
- FALSE - contradicted by solid evidence
- UNVERIFIED - not enough public evidence to rate
- OPINION - not a factual claim, a value judgment

OUTPUT FORMAT (always use this exact markdown structure)
Start with a single line containing only:
**Overall Verdict:** <LABEL>

Then:

## Summary
One short paragraph (2-3 sentences) describing the source material and your overall finding.

## Claims Analyzed

### 1. "<exact quote or close paraphrase of the claim>"
**Verdict:** <LABEL>

<2-4 sentence analysis with specific facts, numbers, and dates when possible. Note what you are confident about vs. what you cannot verify.>

(repeat numbered sections for every distinct claim)

## Red Flags
Bulleted list of manipulation techniques present (loaded language, cherry-picked stats, misleading comparisons, unattributed quotes, emotional framing, out-of-context dates, guilt by association, etc.). If none, write "- None detected."

## Missing Context
Bulleted list of information a reasonable reader would need that is absent from the source. If none, write "- None."

## How To Verify Yourself
2-4 bullets: the primary sources, databases, or search queries a reader could use to independently confirm the findings.

HARD RULES
- Be explicit about uncertainty. If your training data does not cover recent events, say so and mark those claims UNVERIFIED rather than guessing.
- Do not show partisan preference. Apply the same skepticism to all sides.
- Never invent sources, studies, quotes, or statistics.
- Keep analysis focused on verifiable facts, not political opinion.
- For YouTube/TikTok content: focus on spoken claims and on-screen text. Note if no transcript was available.
- For follow-up questions in the same conversation, stay in fact-checker mode and keep answers concise.`

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
