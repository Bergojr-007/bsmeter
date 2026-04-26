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
const FREE_LIMIT = 5
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
  const scoreStr = bsScore >= 0 ? ` (${bsScore}% BS)` : ''
  return `${mascot} "${query.slice(0, 80)}${query.length > 80 ? '...' : ''}" — Verdict: ${verdict ?? 'UNVERIFIED'}${scoreStr}\n\nFact-checked at bsmeter.org 😈`
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
        <div className="px-6 pt-6 pb-4 text-center" style={{ background: 'linear-gradient(180deg, #3C3489 0%, #26215C 100%)' }}>
          <div className="text-4xl mb-2">👑</div>
          <div className="text-lg font-black text-white mb-1">You've used {checksUsed} free checks today</div>
          <div style={{ color: '#AFA9EC', fontSize: 13 }}>Free tier: {FREE_LIMIT} checks/day. Go Pro for unlimited.</div>
        </div>
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
        <div className="px-6 pb-6">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/stripe', {
                  method: 'POST',
                  headers: {
