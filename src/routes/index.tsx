import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Link2, Square, Flame, CheckCircle, AlertTriangle, MessageSquare, History, Trash2, X, Clock, Share2, Crown, Zap } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { useAIChat } from '@/lib/ai-hook'
import type { ChatMessages } from '@/lib/ai-hook'

// ─── Types ────────────────────────────────────────────────────────────────────
type Verdict = 'TRUE' | 'MOSTLY TRUE' | 'MIXED' | 'MISLEADING' | 'MOSTLY FALSE' | 'FALSE' | 'UNVERIFIED' | 'OPINION'
type ExampleType = 'claim' | 'youtube' | 'tiktok' | 'url'

interface HistoryEntry {
  id: string; timestamp: number; query: string; verdict: Verdict | null
  bsScore: number; summary: string; fullAnalysis: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EXAMPLES: { text: string; type: ExampleType; label: string }[] = [
  { text: 'Inflation is at a 40-year high because of the current administration.', type: 'claim', label: 'Claim' },
  { text: 'A recent poll showed 80% of voters want immigration enforcement tripled.', type: 'claim', label: 'Claim' },
  { text: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'youtube', label: 'YouTube' },
  { text: 'https://www.tiktok.com/@politicsexplained', type: 'tiktok', label: 'TikTok' },
  { text: 'https://www.reuters.com', type: 'url', label: 'News URL' },
  { text: 'Climate change is a hoax invented by China to damage US manufacturing.', type: 'claim', label: 'Claim' },
]

const HISTORY_KEY = 'bsmeter_history'
const USAGE_KEY = 'bsmeter_usage'
const MAX_HISTORY = 50
const FREE_LIMIT = 5   // free checks per day
const PRO_PRICE = '$4.99'

const VERDICT_CONFIG: Record<Verdict, { bg: string; text: string; border: string; borderLeft: string; bsScore: number; label: string; icon: string; dot: string; mascot: string; sidebarBg: string }> = {
  TRUE:           { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', borderLeft: 'border-l-emerald-400', bsScore: 0,   label: 'All Clear',    icon: '✓', dot: 'bg-emerald-500', mascot: '😇', sidebarBg: 'bg-emerald-50' },
  'MOSTLY TRUE':  { bg: 'bg-lime-50',    text: 'text-lime-800',    border: 'border-lime-300',    borderLeft: 'border-l-lime-400',    bsScore: 15,  label: 'Mostly Legit', icon: '~', dot: 'bg-lime-500',    mascot: '😇', sidebarBg: 'bg-lime-50' },
  MIXED:          { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',   borderLeft: 'border-l-amber-400',   bsScore: 40,  label: 'Sketchy',      icon: '!', dot: 'bg-amber-500',   mascot: '🤔', sidebarBg: 'bg-amber-50' },
  MISLEADING:     { bg: 'bg-orange-50',  text: 'text-orange-800',  border: 'border-orange-300',  borderLeft: 'border-l-orange-400',  bsScore: 65,  label: 'Spin Zone',    icon: '⚠', dot: 'bg-orange-500',  mascot: '😈', sidebarBg: 'bg-orange-50' },
  'MOSTLY FALSE': { bg: 'bg-rose-50',    text: 'text-rose-800',    border: 'border-rose-300',    borderLeft: 'border-l-rose-400',    bsScore: 80,  label: 'Mostly BS',    icon: '✗', dot: 'bg-rose-500',    mascot: '😈', sidebarBg: 'bg-rose-50' },
  FALSE:          { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-300',     borderLeft: 'border-l-red-500',     bsScore: 100, label: '100% BS',      icon: '✗', dot: 'bg-red-500',     mascot: '😈', sidebarBg: 'bg-red-50' },
  UNVERIFIED:     { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-300',   borderLeft: 'border-l-slate-300',   bsScore: -1,  label: 'Unknown',      icon: '?', dot: 'bg-slate-400',   mascot: '🤷', sidebarBg: 'bg-slate-50' },
  OPINION:        { bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-300',  borderLeft: 'border-l-purple-400',  bsScore: -1,  label: 'Opinion',      icon: '"', dot: 'bg-purple-400',  mascot: '💭', sidebarBg: 'bg-purple-50' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMeterColor(score: number): string {
  if (score <= 20) return '#10b981'; if (score <= 40) return '#84cc16'
  if (score <= 60) return '#f59e0b'; if (score <= 80) return '#f97316'
  return '#ef4444'
}
function getMeterLabel(score: number): string {
  if (score <= 10) return 'All Clear'; if (score <= 30) return 'Mostly Legit'
  if (score <= 50) return 'Getting Sketchy'; if (score <= 70) return 'Spin Zone'
  if (score <= 85) return 'Mostly BS'; return 'Pure BS'
}
function extractOverallVerdict(content: string): Verdict | null {
  const match = content.match(/Overall Verdict:\**\s*(TRUE|MOSTLY TRUE|MIXED|MISLEADING|MOSTLY FALSE|FALSE|UNVERIFIED|OPINION)/i)
  if (!match) return null; return match[1].toUpperCase() as Verdict
}
function extractSummary(content: string): string {
  const match = content.match(/##\s*Summary\s*\n+([\s\S]*?)(?=\n##|\n###|$)/)
  if (match) return match[1].trim().slice(0, 140); return content.slice(0, 140)
}
function timeAgo(ts: number): string {
  const diff = Date.now() - ts; const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000); const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`; return `${days}d ago`
}

// ─── Usage tracking ───────────────────────────────────────────────────────────
interface UsageData { date: string; count: number; isPro: boolean }

function loadUsage(): UsageData {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    const today = new Date().toDateString()
    if (!raw) return { date: today, count: 0, isPro: false }
    const data = JSON.parse(raw) as UsageData
    if (data.date !== today) return { date: today, count: 0, isPro: data.isPro }
    return data
  } catch { return { date: new Date().toDateString(), count: 0, isPro: false } }
}
function saveUsage(data: UsageData) {
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(data)) } catch {}
}

// ─── localStorage history ─────────────────────────────────────────────────────
function loadHistory(): HistoryEntry[] {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY))) } catch {}
}

// ─── Share helpers ────────────────────────────────────────────────────────────
function buildShareText(query: string, verdict: Verdict | null, bsScore: number): string {
  const cfg = verdict ? VERDICT_CONFIG[verdict] : null
  const mascot = cfg?.mascot ?? '🤔'
  const label = cfg?.label ?? 'Unknown'
  const scoreStr = bsScore >= 0 ? ` (${bsScore}% BS)` : ''
  return `${mascot} "${query.slice(0, 80)}${query.length > 80 ? '...' : ''}" — Verdict: ${verdict ?? 'UNVERIFIED'}${scoreStr}

Fact-checked at bsmeter.org 😈`
}

// ─── Pro Upgrade Modal ────────────────────────────────────────────────────────
function ProModal({ onClose, checksUsed }: { onClose: () => void; checksUsed: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t) }, [])
  const dismiss = () => { setVisible(false); setTimeout(onClose, 300) }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className={`relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
        style={{ background: '#26215C', border: '1px solid #534AB7' }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center" style={{ background: 'linear-gradient(180deg, #3C3489 0%, #26215C 100%)' }}>
          <div className="text-4xl mb-2">👑</div>
          <div className="text-lg font-black text-white mb-1">You've used {checksUsed} free checks today</div>
          <div style={{ color: '#AFA9EC', fontSize: 13 }}>Free tier: {FREE_LIMIT} checks/day. Go Pro for unlimited.</div>
        </div>
        {/* Features */}
        <div className="px-6 py-4">
          {[
            ['😈', 'Unlimited fact-checks per day'],
            ['🎬', 'Full YouTube & TikTok analysis'],
            ['📚', 'Unlimited history storage'],
            ['⚡', 'Priority processing'],
            ['🔗', 'Shareable result links'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3 py-2">
              <span className="text-lg">{icon}</span>
              <span className="text-sm font-medium" style={{ color: '#CECBF6' }}>{text}</span>
              <span className="ml-auto text-xs font-bold" style={{ color: '#10b981' }}>✓</span>
            </div>
          ))}
        </div>
        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/stripe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'create_checkout' })
                })
                const data = await res.json()
                if (data.url) window.location.href = data.url
                else alert('Payment setup in progress — check back soon!')
              } catch {
                alert('Payment setup in progress — check back soon!')
              }
            }}
            className="w-full py-3 rounded-xl text-white font-black text-base transition-transform hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
          >
            Go Pro — {PRO_PRICE}/month 😈
          </button>
          <button onClick={dismiss} className="w-full mt-3 py-2 text-sm font-medium transition-colors" style={{ color: '#7F77DD' }}>
            Maybe later (keep free tier)
          </button>
        </div>
        <button onClick={dismiss} className="absolute top-4 right-4 rounded-full w-6 h-6 flex items-center justify-center text-white/60 hover:text-white" style={{ background: '#534AB7' }}>×</button>
      </div>
    </div>
  )
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
function ShareModal({ query, verdict, bsScore, onClose }: { query: string; verdict: Verdict | null; bsScore: number; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const shareText = buildShareText(query, verdict, bsScore)
  const shareUrl = `https://bsmeter.org`
  const cfg = verdict ? VERDICT_CONFIG[verdict] : null

  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t) }, [])
  const dismiss = () => { setVisible(false); setTimeout(onClose, 300) }

  const copyText = async () => {
    try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  const shareTwitter = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank')
  const shareFacebook = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`, '_blank')
  const shareTelegram = () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank')
  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`, '_blank')

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className={`relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
        style={{ background: '#26215C', border: '1px solid #534AB7' }}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between" style={{ borderBottom: '0.5px solid #534AB7' }}>
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4" style={{ color: '#7F77DD' }} />
            <span className="font-bold text-white text-sm">Share this result</span>
          </div>
          <button onClick={dismiss} className="rounded-full w-6 h-6 flex items-center justify-center text-white/60 hover:text-white" style={{ background: '#534AB7' }}>×</button>
        </div>

        {/* Preview card */}
        <div className="mx-5 mt-4 rounded-xl p-4" style={{ background: '#3C3489', border: '0.5px solid #534AB7' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{cfg?.mascot ?? '🤔'}</span>
            {verdict && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${cfg?.bg} ${cfg?.text} ${cfg?.border}`}>
                {cfg?.icon} {verdict}
              </span>
            )}
            {bsScore >= 0 && (
              <span className="ml-auto text-xs font-black" style={{ color: getMeterColor(bsScore) }}>{bsScore}% BS</span>
            )}
          </div>
          <div className="text-xs leading-relaxed line-clamp-3" style={{ color: '#AFA9EC' }}>"{query}"</div>
          <div className="mt-2 text-[10px] font-bold" style={{ color: '#534AB7' }}>bsmeter.org 😈</div>
        </div>

        {/* Share buttons */}
        <div className="p-5 grid grid-cols-2 gap-2">
          <button onClick={shareTwitter} className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#000' }}>
            𝕏 Twitter
          </button>
          <button onClick={shareFacebook} className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#1877F2' }}>
            Facebook
          </button>
          <button onClick={shareWhatsApp} className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#25D366' }}>
            WhatsApp
          </button>
          <button onClick={shareTelegram} className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#2AABEE' }}>
            Telegram
          </button>
        </div>

        {/* Copy button */}
        <div className="px-5 pb-5">
          <button onClick={copyText} className="w-full py-2.5 rounded-xl text-sm font-bold transition-all" style={{ background: copied ? '#10b981' : '#534AB7', color: '#fff' }}>
            {copied ? '✓ Copied to clipboard!' : '📋 Copy text'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Devil Popup ──────────────────────────────────────────────────────────────
function DevilPopup({ score, onClose }: { score: number; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 300); return () => clearTimeout(t) }, [])
  const dismiss = () => { setVisible(false); setTimeout(onClose, 400) }
  return (
    <div className={`fixed bottom-24 right-4 z-50 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`} style={{ maxWidth: 260 }}>
      <div className="relative rounded-2xl border-2 border-red-400 bg-white shadow-2xl overflow-hidden">
        <div className="bg-red-500 px-4 py-2 flex items-center justify-between">
          <span className="text-white font-bold text-xs uppercase tracking-wider">BS Alert</span>
          <button onClick={dismiss} className="text-white/80 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="text-4xl flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px #ef4444)' }}>😈</div>
            <div>
              <div className="font-bold text-red-700 text-sm mb-1">{score >= 90 ? 'Oh come on.' : score >= 80 ? 'Big nope.' : 'Smells fishy!'}</div>
              <div className="text-xs text-slate-600 leading-relaxed">{score >= 90 ? "This claim is so false it's almost impressive." : score >= 80 ? "Mostly false. Someone's hoping you won't check sources." : 'Misleading framing detected — read the full analysis.'}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-semibold mb-1">
              <span className="text-slate-500">BS Level</span>
              <span className="text-red-600 font-black">{score}%</span>
            </div>
            <div className="h-3 rounded-full bg-red-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${score}%`, background: 'linear-gradient(90deg, #fca5a5, #ef4444)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BS Meter ─────────────────────────────────────────────────────────────────
function BSMeter({ score, mascot }: { score: number; mascot: string }) {
  const [displayScore, setDisplayScore] = useState(0)
  const color = getMeterColor(Math.max(score, 0))
  useEffect(() => {
    setDisplayScore(0); if (score < 0) return
    const start = Date.now(); const duration = 1400
    const animate = () => {
      const elapsed = Date.now() - start; const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3); setDisplayScore(Math.round(eased * score))
      if (progress < 1) requestAnimationFrame(animate)
    }
    const frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame)
  }, [score])
  const circumference = Math.PI * 54
  const dashOffset = score < 0 ? circumference : circumference - (displayScore / 100) * circumference
  return (
    <div className="flex flex-col items-center py-4 px-3">
      <div className="text-[9px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: '#7F77DD' }}>BS Meter</div>
      <div className="text-2xl mb-1">{mascot}</div>
      <div className="relative" style={{ width: 120, height: 70 }}>
        <svg width="120" height="74" viewBox="0 0 120 74">
          <path d="M 8 68 A 52 52 0 0 1 112 68" fill="none" stroke="#CECBF6" strokeWidth="9" strokeLinecap="round" />
          <path d="M 8 68 A 52 52 0 0 1 112 68" fill="none" stroke={score < 0 ? '#AFA9EC' : color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${circumference}`} strokeDashoffset={`${dashOffset}`}
            style={{ transition: 'stroke-dashoffset 0.04s linear, stroke 0.5s ease' }} />
          <g transform={`rotate(${score < 0 ? 0 : -90 + (displayScore / 100) * 180}, 60, 68)`}>
            <line x1="60" y1="68" x2="60" y2="24" stroke="#26215C" strokeWidth="2" strokeLinecap="round" />
            <circle cx="60" cy="68" r="4" fill="#26215C" />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5">
          <span className="text-lg font-black tabular-nums" style={{ color: score < 0 ? '#7F77DD' : color, lineHeight: 1 }}>
            {score < 0 ? 'N/A' : `${displayScore}%`}
          </span>
        </div>
      </div>
      <div className="mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background: score < 0 ? '#EEEDFE' : `${color}20`, color: score < 0 ? '#534AB7' : color }}>
        {score < 0 ? 'Not Applicable' : getMeterLabel(score)}
      </div>
    </div>
  )
}

// ─── Verdict Badge ────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.UNVERIFIED
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-wide uppercase ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span>{cfg.icon}</span>{verdict}
    </span>
  )
}

// ─── Fact Check Card ──────────────────────────────────────────────────────────
function FactCheckCard({ role, content, onShare }: { role: 'user' | 'assistant'; content: string; onShare?: (verdict: Verdict | null, bsScore: number) => void }) {
  const verdict = useMemo(() => role === 'assistant' ? extractOverallVerdict(content) : null, [role, content])
  const [devilDismissed, setDevilDismissed] = useState(false)
  const cfg = verdict ? VERDICT_CONFIG[verdict] : null
  const bsScore = cfg?.bsScore ?? -1
  const showDevil = !devilDismissed && bsScore >= 65

  if (role === 'user') {
    return (
      <div className="rounded-xl border p-4 shadow-sm" style={{ background: '#26215C', borderColor: '#534AB7' }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#7F77DD' }}>Submitted for fact-check</div>
        <div className="whitespace-pre-wrap text-sm" style={{ color: '#CECBF6' }}>{content}</div>
      </div>
    )
  }
  return (
    <>
      {showDevil && <DevilPopup score={bsScore} onClose={() => setDevilDismissed(true)} />}
      <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${cfg ? `border-slate-200 border-l-4 ${cfg.borderLeft}` : 'border-slate-200'}`}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100" style={{ background: '#26215C' }}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg text-base flex-shrink-0" style={{ background: '#534AB7' }}>
            {cfg ? cfg.mascot : '😈'}
          </div>
          <div className="text-sm font-semibold" style={{ color: '#CECBF6' }}>Bullshit Meter Analysis</div>
          {verdict && <div className="ml-auto flex items-center gap-2">
            <VerdictBadge verdict={verdict} />
            {onShare && (
              <button onClick={() => onShare(verdict, bsScore)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
                style={{ background: '#3C3489', color: '#CECBF6', border: '0.5px solid #534AB7' }}
                title="Share this result">
                <Share2 className="h-3 w-3" /> Share
              </button>
            )}
          </div>}
        </div>
        <div className="flex divide-x divide-slate-100">
          <div className="flex-1 min-w-0 px-5 py-4 prose prose-sm max-w-none">
            <Streamdown>{content}</Streamdown>
          </div>
          {verdict && cfg && (
            <div className={`w-36 flex-shrink-0 flex flex-col items-center justify-center ${cfg.sidebarBg}`}>
              <BSMeter score={bsScore} mascot={cfg.mascot} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── History Sidebar ──────────────────────────────────────────────────────────
function HistorySidebar({ history, open, onClose, onSelect, onClear, onDelete }: {
  history: HistoryEntry[]; open: boolean; onClose: () => void
  onSelect: (e: HistoryEntry) => void; onClear: () => void; onDelete: (id: string) => void
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 right-0 z-40 h-full w-80 flex flex-col shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#26215C', borderLeft: '0.5px solid #534AB7' }}>
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '0.5px solid #534AB7' }}>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" style={{ color: '#7F77DD' }} />
            <span className="font-semibold text-sm" style={{ color: '#fff' }}>Check History</span>
            {history.length > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#534AB7', color: '#CECBF6' }}>{history.length}</span>}
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && <button onClick={onClear} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium" style={{ color: '#ef4444' }}><Trash2 className="h-3 w-3" /> Clear all</button>}
            <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: '#CECBF6' }}><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <div className="text-4xl">🔍</div>
              <div className="text-sm font-semibold" style={{ color: '#fff' }}>No checks yet</div>
              <div className="text-xs leading-relaxed" style={{ color: '#7F77DD' }}>Your fact-checks will appear here automatically.</div>
            </div>
          ) : (
            <div>
              {history.map((entry) => {
                const cfg = entry.verdict ? VERDICT_CONFIG[entry.verdict] : null
                return (
                  <div key={entry.id} className="group relative transition-colors" style={{ borderBottom: '0.5px solid #3C3489' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#3C3489')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <button onClick={() => { onSelect(entry); onClose() }} className="w-full text-left px-4 py-3 pr-10">
                      <div className="flex items-center gap-2 mb-1">
                        {cfg && <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.icon} {entry.verdict}</span>}
                        <span className="text-[10px] flex items-center gap-1 ml-auto" style={{ color: '#7F77DD' }}><Clock className="h-2.5 w-2.5" />{timeAgo(entry.timestamp)}</span>
                      </div>
                      <div className="text-xs font-semibold line-clamp-2 mb-1 leading-snug" style={{ color: '#fff' }}>{entry.query}</div>
                      {entry.summary && <div className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: '#7F77DD' }}>{entry.summary}</div>}
                      {entry.bsScore >= 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#3C3489' }}>
                            <div className="h-full rounded-full" style={{ width: `${entry.bsScore}%`, background: getMeterColor(entry.bsScore) }} />
                          </div>
                          <span className="text-[10px] font-bold" style={{ color: getMeterColor(entry.bsScore) }}>{entry.bsScore}%</span>
                        </div>
                      )}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}
                      className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 rounded p-1 transition-all"
                      style={{ background: '#534AB7', color: '#CECBF6' }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {history.length > 0 && (
          <div className="px-4 py-3" style={{ borderTop: '0.5px solid #534AB7', background: '#1a1635' }}>
            <p className="text-[10px] text-center" style={{ color: '#534AB7' }}>Saved locally · {history.length}/{MAX_HISTORY} stored</p>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Results ──────────────────────────────────────────────────────────────────
function Results({ messages, onShare }: { messages: ChatMessages; onShare: (query: string, verdict: Verdict | null, bsScore: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight }, [messages])
  if (!messages.length) return null

  let lastUserQuery = ''
  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto pb-6">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4">
        {messages.map((message) => {
          const textContent = message.parts.filter((p: any) => p.type === 'text').map((p: any) => p.content).join('')
          if (!textContent) return null
          if (message.role === 'user') { lastUserQuery = textContent }
          const capturedQuery = lastUserQuery
          return (
            <FactCheckCard key={message.id} role={message.role as 'user' | 'assistant'} content={textContent}
              onShare={message.role === 'assistant' ? (v, s) => onShare(capturedQuery, v, s) : undefined} />
          )
        })}
      </div>
    </div>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { icon: <MessageSquare className="h-5 w-5" />, title: 'Paste any claim', desc: 'Drop in a tweet, headline, quote, or news URL.' },
    { icon: <History className="h-5 w-5" />, title: 'AI extracts claims', desc: 'Every checkable factual claim is pulled out.' },
    { icon: <AlertTriangle className="h-5 w-5" />, title: 'BS Meter fires up', desc: "Each claim gets a verdict and a BS score." },
    { icon: <CheckCircle className="h-5 w-5" />, title: 'Verify yourself', desc: 'Primary sources listed so you can confirm.' },
  ]
  return (
    <section id="how" className="py-16" style={{ background: '#26215C', borderTop: '0.5px solid #534AB7' }}>
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#fff' }}>How Bullshit Meter works</h2>
          <p className="text-sm max-w-sm mx-auto" style={{ color: '#AFA9EC' }}>No partisan agenda. Transparent analysis you can always verify yourself.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#3C3489', color: '#CECBF6' }}>{step.icon}</div>
              <div className="text-sm font-semibold" style={{ color: '#fff' }}>{step.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: '#AFA9EC' }}>{step.desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl p-6" style={{ background: '#3C3489', border: '0.5px solid #534AB7' }}>
          <div className="mb-4 text-center text-xs font-bold uppercase tracking-widest" style={{ color: '#7F77DD' }}>Verdict Scale</div>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.entries(VERDICT_CONFIG) as [Verdict, typeof VERDICT_CONFIG[Verdict]][]).map(([v, cfg]) => (
              <span key={v} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.icon} {v}</span>
            ))}
          </div>
          {/* Pricing teaser */}
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/stripe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'create_checkout' }),
                })
                const data = await res.json()
                if (data.url) window.location.href = data.url
                else alert('Payment setup in progress — check back soon!')
              } catch {
                alert('Payment setup in progress — check back soon!')
              }
            }}
            className="mt-6 rounded-xl p-4 flex items-center justify-between gap-4 w-full cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: '#26215C', border: '0.5px solid #534AB7' }}
          >
            <div>
              <div className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: '#CECBF6' }}>👑 Go Pro</div>
              <div className="text-xs" style={{ color: '#7F77DD' }}>Unlimited checks · Priority · Full history</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-black" style={{ color: '#fff' }}>{PRO_PRICE}<span className="text-xs font-normal" style={{ color: '#7F77DD' }}>/mo</span></div>
              <div className="text-[10px]" style={{ color: '#7F77DD' }}>{FREE_LIMIT} free/day</div>
            </div>
          </button>
        </div>
      </div>
    </section>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────
function Landing({ onExample }: { onExample: (text: string) => void }) {
  return (
    <>
      <div className="flex flex-1 items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(180deg, #26215C 0%, #3C3489 60%, transparent 100%)' }}>
        <div className="mx-auto w-full max-w-2xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm" style={{ background: '#EEEDFE', border: '0.5px solid #AFA9EC', color: '#534AB7' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: '#7DF9AA' }}></span>
            Non-partisan claim analysis
          </div>
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl leading-tight" style={{ color: '#fff' }}>
            Cut through<br />the bullshit.
          </h1>
          <p className="mb-4 text-base sm:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: '#AFA9EC' }}>
            Paste any claim, YouTube or TikTok video, or news URL.{' '}
            <span style={{ color: '#10b981', fontWeight: 600 }}>😇 Angels</span> for truth,{' '}
            <span style={{ color: '#ef4444', fontWeight: 600 }}>😈 Devils</span> for BS — the meter never lies.
          </p>
          {/* Free tier notice */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid #534AB7', color: '#AFA9EC' }}>
            <Zap className="h-3 w-3" style={{ color: '#f59e0b' }} />
            {FREE_LIMIT} free checks per day · Go Pro for unlimited
          </div>
          <div className="grid gap-2 text-left sm:grid-cols-3 mb-4">
            {EXAMPLES.map((ex) => {
              const iconMap: Record<ExampleType, React.ReactNode> = {
                youtube: <span style={{ color: '#ef4444', fontWeight: 700 }}>▶</span>,
                tiktok: <span style={{ fontWeight: 700, color: '#CECBF6' }}>♪</span>,
                url: <Link2 className="h-3 w-3" />,
                claim: <span>💬</span>,
              }
              return (
                <button key={ex.text} type="button" onClick={() => onExample(ex.text)}
                  className="rounded-xl p-3.5 text-xs transition-all hover:-translate-y-0.5 text-left"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid #7F77DD', color: '#CECBF6' }}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#AFA9EC' }}>
                    {iconMap[ex.type]} {ex.label}
                  </div>
                  <div className="line-clamp-3 leading-relaxed">{ex.text}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <HowItWorks />
    </>
  )
}

// ─── Usage Bar ────────────────────────────────────────────────────────────────
function UsageBar({ usage, onUpgrade }: { usage: UsageData; onUpgrade: () => void }) {
  if (usage.isPro) return (
    <div className="flex items-center justify-center gap-2 py-1.5 text-xs" style={{ color: '#10b981' }}>
      <Crown className="h-3 w-3" /> Pro — unlimited checks
    </div>
  )
  const remaining = Math.max(0, FREE_LIMIT - usage.count)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#3C3489' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((usage.count / FREE_LIMIT) * 100, 100)}%`, background: remaining === 0 ? '#ef4444' : '#534AB7' }} />
      </div>
      <span className="text-[11px] font-medium flex-shrink-0" style={{ color: remaining === 0 ? '#ef4444' : '#7F77DD' }}>
        {remaining === 0 ? 'Limit reached' : `${remaining} free left today`}
      </span>
      {remaining <= 1 && (
        <button onClick={onUpgrade} className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#ef4444', color: '#fff' }}>
          Go Pro 👑
        </button>
      )}
    </div>
  )
}

// ─── Main Home ────────────────────────────────────────────────────────────────
function Home() {
  const [input, setInput] = useState('')
  const [videoContextPending, setVideoContextPending] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [replayEntry, setReplayEntry] = useState<HistoryEntry | null>(null)
  const [shareState, setShareState] = useState<{ query: string; verdict: Verdict | null; bsScore: number } | null>(null)
  const [showProModal, setShowProModal] = useState(false)
  const [usage, setUsage] = useState<UsageData>({ date: new Date().toDateString(), count: 0, isPro: false })
  const { messages, sendMessage, isLoading, stop } = useAIChat()

  useEffect(() => {
    setHistory(loadHistory())
    const u = loadUsage()
    // Handle Stripe success redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('pro') === 'success') {
      const proData = { ...u, isPro: true }
      saveUsage(proData); setUsage(proData)
      window.history.replaceState({}, '', '/')
      setTimeout(() => alert('🎉 Welcome to Bullshit Meter Pro! Unlimited checks unlocked. 😈'), 500)
    } else {
      setUsage(u)
    }
  }, [])

  // Save completed checks to history + increment usage
  useEffect(() => {
    if (isLoading || messages.length < 2) return
    const userMsg = messages.find((m) => m.role === 'user')
    const assistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!userMsg || !assistantMsg) return
    const userText = userMsg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.content).join('')
    const assistantText = assistantMsg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.content).join('')
    if (!assistantText) return
    const verdict = extractOverallVerdict(assistantText)
    const cfg = verdict ? VERDICT_CONFIG[verdict] : null
    const bsScore = cfg?.bsScore ?? -1
    const summary = extractSummary(assistantText)
    setHistory((prev) => {
      const isDupe = prev[0]?.query === userText && prev[0]?.verdict === verdict
      if (isDupe) return prev
      const entry: HistoryEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now(), query: userText, verdict, bsScore, summary, fullAnalysis: assistantText }
      const updated = [entry, ...prev].slice(0, MAX_HISTORY)
      saveHistory(updated); return updated
    })
  }, [isLoading, messages])

  const isVideoUrl = (t: string): boolean => {
    try {
      const u = new URL(t.trim())
      return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be' || u.hostname.includes('tiktok.com')
    } catch { return false }
  }

  const handleSend = useCallback((text: string) => {
    const current = loadUsage()
    if (!current.isPro && current.count >= FREE_LIMIT) { setShowProModal(true); return }

    // If it's a plain video URL with no added context, ask first
    if (isVideoUrl(text.trim()) && !videoContextPending) {
      setVideoContextPending(text.trim())
      setInput('')
      return
    }

    // If we have a pending video URL, combine it with the user's context
    let finalText = text
    if (videoContextPending) {
      finalText = videoContextPending + '\n\nSpecifically, please fact-check: ' + text
      setVideoContextPending(null)
    }

    const updated = { ...current, count: current.count + 1 }
    saveUsage(updated); setUsage(updated)
    setReplayEntry(null); sendMessage(finalText); setInput('')
  }, [sendMessage, videoContextPending])

  const handleDeleteEntry = useCallback((id: string) => { setHistory((prev) => { const u = prev.filter((e) => e.id !== id); saveHistory(u); return u }) }, [])
  const handleClearHistory = useCallback(() => { if (!confirm('Clear all history?')) return; setHistory([]); localStorage.removeItem(HISTORY_KEY) }, [])

  const hasMessages = messages.length > 0
  const placeholder = videoContextPending
    ? 'Describe the specific claim or topic to fact-check in this video...'
    : hasMessages
      ? 'Ask a follow-up, or paste another claim...'
      : 'Paste a claim, headline, YouTube/TikTok URL, or news article...'

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col" style={{ background: '#1a1635' }}>
      <HistorySidebar history={history} open={historyOpen} onClose={() => setHistoryOpen(false)}
        onSelect={(e) => setReplayEntry(e)} onClear={handleClearHistory} onDelete={handleDeleteEntry} />

      {shareState && (
        <ShareModal query={shareState.query} verdict={shareState.verdict} bsScore={shareState.bsScore}
          onClose={() => setShareState(null)} />
      )}
      {showProModal && <ProModal onClose={() => setShowProModal(false)} checksUsed={usage.count} />}

      {/* Video context prompt */}
        {videoContextPending && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ background: 'rgba(83,74,171,0.18)', border: '1px solid rgba(131,111,214,0.35)', color: '#CECBF6' }}
            >
              <div className="mb-1 flex items-center gap-2 font-semibold" style={{ color: '#C084FC' }}>
                ▶ Video URL detected
                <button
                  onClick={() => { setVideoContextPending(null); setInput('') }}
                  className="ml-auto text-xs opacity-60 hover:opacity-100"
                  style={{ color: '#AFA9EC' }}
                >
                  ✕ Cancel
                </button>
              </div>
              <div style={{ color: '#AFA9EC' }}>
                What specific claim or topic should I fact-check in this video?
              </div>
              <div className="mt-1 truncate text-xs" style={{ color: '#7F77DD' }}>
                {videoContextPending}
              </div>
            </div>
          </div>
        )}

        {/* Replay viewer */}
      {replayEntry && !hasMessages && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs" style={{ color: '#7F77DD' }}>
              <Clock className="h-3.5 w-3.5" />
              {new Date(replayEntry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <button onClick={() => setReplayEntry(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium" style={{ color: '#AFA9EC', background: '#3C3489' }}>
              <X className="h-3 w-3" /> Close
            </button>
          </div>
          <FactCheckCard role="user" content={replayEntry.query} />
          <div className="mt-3">
            <FactCheckCard role="assistant" content={replayEntry.fullAnalysis}
              onShare={(v, s) => setShareState({ query: replayEntry.query, verdict: v, bsScore: s })} />
          </div>
        </div>
      )}

      {!hasMessages && !replayEntry ? (
        <Landing onExample={(text) => setInput(text)} />
      ) : hasMessages ? (
        <div className="flex flex-1 flex-col pt-4 min-h-0" style={{ background: '#1a1635' }}>
          <Results messages={messages} onShare={(q, v, s) => setShareState({ query: q, verdict: v, bsScore: s })} />
        </div>
      ) : null}

      {/* Input bar */}
      <div className="sticky bottom-0 left-0 right-0 backdrop-blur" style={{ background: 'rgba(26,22,53,0.97)', borderTop: '0.5px solid #534AB7' }}>
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-2">
          {/* Usage bar */}
          <UsageBar usage={usage} onUpgrade={() => setShowProModal(true)} />

          {isLoading && (
            <div className="mb-2 flex items-center justify-center">
              <button onClick={stop} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: '#3C3489', border: '0.5px solid #7F77DD', color: '#CECBF6' }}>
                <Square className="h-3 w-3 fill-current" /> Stop analysis
              </button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); const t = input.trim(); if (t && !isLoading) handleSend(t) }} className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = input.trim(); if (t && !isLoading) handleSend(t) } }}
                placeholder={placeholder} rows={hasMessages ? 1 : 3} disabled={isLoading}
                className="w-full resize-none rounded-xl px-4 py-3 text-sm focus:outline-none disabled:opacity-60"
                style={{ background: '#3C3489', border: '1px solid #7F77DD', color: '#fff' }} />
            </div>
            <button type="button" onClick={() => setHistoryOpen(true)}
              className="relative inline-flex h-[46px] items-center gap-2 rounded-xl px-3 text-sm font-medium transition"
              style={{ background: '#3C3489', border: '0.5px solid #7F77DD', color: '#CECBF6' }} title="View history">
              <History className="h-4 w-4" />
              {history.length > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: '#534AB7' }}>{history.length > 9 ? '9+' : history.length}</span>}
            </button>
            <button type="submit" disabled={!input.trim() || isLoading}
              className="inline-flex h-[46px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
              style={{ background: '#534AB7' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3C3489')}
              onMouseLeave={e => (e.currentTarget.style.background = '#534AB7')}>
              <Flame className="h-4 w-4" />
              <span className="hidden sm:inline">Check it</span>
            </button>
          </form>
          <p className="mt-2 text-center text-[11px]" style={{ color: '#7F77DD' }}>
            AI-generated analysis. Always verify important claims against primary sources.
          </p>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Home,
})
