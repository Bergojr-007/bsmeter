import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0]
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const shortMatch = u.pathname.match(/\/(shorts|embed|v)\/([^/?]+)/)
      if (shortMatch) return shortMatch[2]
    }
  } catch {}
  return null
}

function extractTikTokInfo(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname.includes('tiktok.com')
  } catch { return false }
}

async function fetchYouTubeInfo(videoId: string): Promise<{ title?: string; description?: string; transcript?: string }> {
  // Fetch the YouTube watch page and pull out metadata + auto-captions
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BSMeterBot/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const html = await res.text()

    // Extract title
    const titleMatch = html.match(/"title":"([^"]+)"/)
    const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, '&') : undefined

    // Extract description
    const descMatch = html.match(/"shortDescription":"([\s\S]*?)"(?:,"isCrawlable)/)
    const description = descMatch
      ? descMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').slice(0, 1000)
      : undefined

    // Extract caption track URL
    const captionMatch = html.match(/"captionTracks":\[.*?"baseUrl":"([^"]+)"/)
    let transcript: string | undefined

    if (captionMatch) {
      const captionUrl = captionMatch[1].replace(/\\u0026/g, '&')
      const capRes = await fetch(captionUrl, { signal: controller.signal })
      const capXml = await capRes.text()
      // Strip XML tags and decode entities
      transcript = capXml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12_000)
    }

    return { title, description, transcript }
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const fetchWebPageToolDef = toolDefinition({
  name: 'fetchWebPage',
  description:
    'Fetch a web page, news article, social media post, or YouTube/TikTok video URL and return its text content for fact-checking. For YouTube URLs, extracts the video title, description, and transcript. For TikTok URLs, extracts available metadata. For all other URLs, fetches the page text.',
  inputSchema: z.object({
    url: z.string().describe('The fully-qualified URL to fetch'),
  }),
  outputSchema: z.object({
    url: z.string(),
    status: z.number(),
    title: z.string().optional(),
    text: z.string(),
    truncated: z.boolean(),
    mediaType: z.enum(['youtube', 'tiktok', 'webpage']).optional(),
  }),
})

const MAX_CHARS = 15_000

function stripHtml(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : undefined
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text }
}

export const fetchWebPage = fetchWebPageToolDef.server(async ({ url }) => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { url, status: 0, text: 'Invalid URL provided.', truncated: false }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { url, status: 0, text: 'Only http and https URLs are supported.', truncated: false }
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    const { title, description, transcript } = await fetchYouTubeInfo(youtubeId)
    const parts: string[] = []
    if (title)       parts.push(`VIDEO TITLE: ${title}`)
    if (description) parts.push(`VIDEO DESCRIPTION: ${description}`)
    if (transcript)  parts.push(`VIDEO TRANSCRIPT:\n${transcript}`)
    else             parts.push('Note: No auto-generated transcript available for this video. Analyze based on title and description only.')
    const text = parts.join('\n\n')
    return {
      url,
      status: 200,
      title,
      text: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
      mediaType: 'youtube' as const,
    }
  }

  // ── TikTok ───────────────────────────────────────────────────────────────
  if (extractTikTokInfo(url)) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BSMeterBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
      })
      const html = await res.text()
      const { title, text } = stripHtml(html)
      const truncated = text.length > MAX_CHARS
      return {
        url: res.url,
        status: res.status,
        title,
        text: (truncated ? text.slice(0, MAX_CHARS) : text),
        truncated,
        mediaType: 'tiktok' as const,
      }
    } catch (error: any) {
      return {
        url,
        status: 0,
        text: `TikTok page could not be fetched: ${error?.message || 'unknown error'}. Note: TikTok heavily restricts scraping — analyze based on any visible metadata only.`,
        truncated: false,
        mediaType: 'tiktok' as const,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  // ── Regular web page ─────────────────────────────────────────────────────
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BSMeterBot/1.0; +https://bsmeter.org)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })
    const bodyRaw = await response.text()
    const contentType = response.headers.get('content-type') || ''
    const { title, text } = contentType.includes('html')
      ? stripHtml(bodyRaw)
      : { title: undefined, text: bodyRaw.replace(/\s+/g, ' ').trim() }
    const truncated = text.length > MAX_CHARS
    return {
      url: response.url,
      status: response.status,
      title,
      text: truncated ? text.slice(0, MAX_CHARS) : text,
      truncated,
      mediaType: 'webpage' as const,
    }
  } catch (error: any) {
    return {
      url,
      status: 0,
      text: `Failed to fetch page: ${error?.message || 'unknown error'}`,
      truncated: false,
    }
  } finally {
    clearTimeout(timeout)
  }
})
