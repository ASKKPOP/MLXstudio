import { useState, useRef, useEffect } from 'react'
import {
  Plus, Search, X, MessageSquare, Server, Wrench,
  ImageIcon, Code2, Terminal, Settings, ChevronRight,
  Sun, Moon, Monitor, Palette, PanelLeftClose,
} from 'lucide-react'
import { ChatHistory } from './ChatHistory'
import { InferenceModeToggle, useInferenceMode } from './InferenceMode'
import { useAppState } from '../../contexts/AppStateContext'
import { useTheme } from '../../providers/ThemeProvider'
import { useTranslation, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from '../../i18n'
import type { AppMode } from '../../types/app-state'

/** ClaudeIcon — small diamond for the Claude theme button */
function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" className={className} aria-hidden>
      <path d="M7 1.5 L11 7 L7 12.5 L3 7 Z" fill="currentColor" opacity="0.85" />
      <path d="M1.5 7 L7 3 L12.5 7 L7 11 Z" fill="currentColor" opacity="0.4" />
    </svg>
  )
}

// ─── Nav item definition ────────────────────────────────────────────────────
interface NavItem {
  mode: AppMode
  icon: React.ReactNode
  label: string
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { mode: 'server', icon: <Server className="h-4 w-4" />, label: 'Servers' },
  { mode: 'tools',  icon: <Wrench  className="h-4 w-4" />, label: 'Tools' },
  { mode: 'image',  icon: <ImageIcon className="h-4 w-4" />, label: 'Image' },
  { mode: 'api',    icon: <Code2   className="h-4 w-4" />, label: 'API' },
  { mode: 'code',   icon: <Terminal className="h-4 w-4" />, label: 'Code', badge: 'soon' },
]

// ─── Customize panel (slides up from the bottom) ────────────────────────────
function CustomizePanel({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const themes = [
    { id: 'dark',   icon: <Moon className="h-3.5 w-3.5" />,         label: 'Dark' },
    { id: 'light',  icon: <Sun  className="h-3.5 w-3.5" />,         label: 'Light' },
    { id: 'claude', icon: <ClaudeIcon className="h-3.5 w-3.5" />,   label: 'Claude' },
    { id: 'system', icon: <Monitor className="h-3.5 w-3.5" />,      label: 'System' },
  ] as const

  const locales: Locale[] = ['en', 'zh', 'ko', 'ja', 'es']

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-2 right-2 mb-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 fade-in duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Customize</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Theme */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Theme</p>
          <div className="grid grid-cols-2 gap-1.5">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 ${
                  theme === t.id
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-accent/50 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Language</p>
          <div className="grid grid-cols-3 gap-1.5">
            {locales.map(l => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border transition-all duration-150 ${
                  locale === l
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-accent/50 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span>{LOCALE_FLAGS[l]}</span>
                <span className="truncate">{LOCALE_NAMES[l]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Sidebar component ──────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean
  currentChatId: string | null
  onChatSelect: (chatId: string, modelPath: string) => void
  onNewChat: () => void
}

export function Sidebar({ collapsed, currentChatId, onChatSelect, onNewChat }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const { state, setMode, dispatch } = useAppState()
  const mode = state.mode
  const { mode: inferMode, setMode: setInferMode } = useInferenceMode()
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const closeSearch = () => {
    setSearchQuery('')
    setSearchOpen(false)
  }

  const handleNavClick = (navMode: AppMode) => {
    setMode(navMode)
    if (navMode === 'server' && state.serverPanel === 'about') {
      dispatch({ type: 'SET_SERVER_PANEL', panel: 'dashboard' })
    }
  }

  return (
    <div
      className={`relative h-full bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200 overflow-hidden ${
        collapsed ? 'w-0' : 'w-[260px]'
      }`}
    >
      {/* ── Top: app title + collapse toggle ── */}
      <div
        className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold text-foreground tracking-tight pl-1">MLX Studio</span>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Search + New Chat row ── */}
      <div className="px-2 pb-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {searchOpen ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && closeSearch()}
              placeholder="Search chats…"
              className="w-full pl-8 pr-8 py-2 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ring transition-all"
            />
            {searchQuery ? (
              <button
                onClick={closeSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={closeSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex-1 flex items-center gap-2.5 px-3 py-2 bg-accent/60 hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-xs transition-colors group"
              title="Search chats"
            >
              <Search className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">Search chats…</span>
            </button>
            <button
              onClick={onNewChat}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors flex-shrink-0"
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Chat history — if in chat mode ── */}
      <div className="flex-1 overflow-hidden">
        {mode === 'chat' ? (
          <ChatHistory
            currentChatId={currentChatId}
            onChatSelect={onChatSelect}
            searchQuery={searchQuery}
          />
        ) : (
          /* Non-chat mode: show which section is active */
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-2">
            <div className="text-muted-foreground/30">
              {NAV_ITEMS.find(n => n.mode === mode)?.icon}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {NAV_ITEMS.find(n => n.mode === mode)?.label ?? 'Chat'}
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom navigation section ── */}
      <div
        className="flex-shrink-0 border-t border-sidebar-border"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Inference mode toggle */}
        <div className="px-2 pt-2 pb-1">
          <InferenceModeToggle mode={inferMode} onToggle={setInferMode} />
        </div>

        {/* Chat nav button (always show so user can switch back) */}
        <div className="px-2 pt-1">
          <button
            onClick={() => setMode('chat')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              mode === 'chat'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Chat</span>
          </button>
        </div>

        {/* Separator + section label */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Manage</p>
        </div>

        {/* Server / Tools / Image / API / Code */}
        <div className="px-2 space-y-0.5 pb-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.mode}
              onClick={() => handleNavClick(item.mode)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                mode === item.mode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium uppercase tracking-wide">
                  {item.badge}
                </span>
              )}
              {mode === item.mode && (
                <ChevronRight className="h-3 w-3 text-primary/60 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Footer: Customize + About */}
        <div className="px-2 pt-1 pb-3 space-y-0.5 border-t border-sidebar-border mt-1 relative">
          {/* Customize panel */}
          {customizeOpen && (
            <CustomizePanel onClose={() => setCustomizeOpen(false)} />
          )}

          <button
            onClick={() => setCustomizeOpen(v => !v)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              customizeOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Palette className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Customize</span>
          </button>

          <button
            onClick={() => {
              dispatch({ type: 'SET_MODE', mode: 'server' })
              dispatch({ type: 'SET_SERVER_PANEL', panel: 'about' })
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-150"
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Settings & About</span>
          </button>
        </div>
      </div>
    </div>
  )
}
