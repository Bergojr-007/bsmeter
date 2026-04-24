# TruthLens

A non-partisan fact-checking app for political claims, news articles, and social media posts. Paste a tweet, a campaign quote, a headline, or a URL and TruthLens extracts each factual claim, rates it against a standard verdict scale, and calls out the manipulation tactics a casual reader might miss.

## How it works

1. User pastes text or a URL into the home screen.
2. The server route `/api/chat` sends the content to an LLM with a strict fact-checker system prompt.
3. If the input is a URL, the model uses a `fetchWebPage` tool to pull the actual article text before analyzing it.
4. The response streams back as structured markdown: overall verdict, per-claim breakdown, red flags, missing context, and "how to verify yourself" pointers.
5. The UI parses the overall verdict and renders it as a colored badge; follow-up questions stay in fact-checker mode.

## Tech stack

- **TanStack Start** + **TanStack Router** (file-based routing, server handlers)
- **TanStack AI** — multi-provider LLM abstraction
- **React 19**, **Tailwind CSS 4**, **Streamdown** (streaming markdown renderer)
- **Vite 7** for builds, deployed to **Netlify**

## AI providers

The `/api/chat` route picks the first provider whose API key is set, in this order:

1. Anthropic Claude (`ANTHROPIC_API_KEY`)
2. OpenAI GPT-4o (`OPENAI_API_KEY`)
3. Google Gemini (`GEMINI_API_KEY`)
4. Ollama local (`OLLAMA_BASE_URL`)

Set at least one API key for production quality output. On Netlify, add the env var in Site configuration → Environment variables.

## Run locally

```bash
npm install
npm run dev
```

The dev server starts on port 3000. To run through the Netlify dev emulator on port 8888:

```bash
netlify dev
```

## Project layout

```
src/
  lib/
    ai-hook.ts            React hook wrapping @tanstack/ai-react useChat
    fact-check-tools.ts   fetchWebPage tool (server-side URL fetcher)
  routes/
    __root.tsx            HTML shell, header, global styles
    api.chat.ts           POST /api/chat — streaming fact-check endpoint
    index.tsx             Home page UI (paste box + results cards)
  router.tsx              TanStack Router setup
  styles.css              Tailwind + highlight.js imports
```

## Important caveats

- Output quality depends entirely on the underlying model. The model is instructed to mark claims `UNVERIFIED` when it lacks evidence, but users should always verify important claims against primary sources.
- TruthLens does not maintain a database of checked claims; every request is independent.
- The `fetchWebPage` tool performs an unauthenticated HTTP GET and strips HTML. It will not fetch content behind paywalls, JavaScript-rendered SPAs, or login walls.
