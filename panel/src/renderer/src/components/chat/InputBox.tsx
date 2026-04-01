import { useState, useRef, useCallback, useEffect, KeyboardEvent, DragEvent, ClipboardEvent, useMemo } from 'react'
import { Paperclip, Send, Square, ImagePlus, X, ChevronDown, MessageSquare, ImageIcon, Terminal, Plus, Globe, Loader2 } from 'lucide-react'
import { VoiceChat } from './VoiceChat'
import { useAppState } from '../../contexts/AppStateContext'
import { useSessionsContext, type SessionSummary } from '../../contexts/SessionsContext'
import { isImageSession } from '../../../../shared/sessionUtils'

export interface ImageAttachment {
  id: string
  dataUrl: string
  name: string
  type: string
}

interface InputBoxProps {
  onSend: (message: string, attachments?: ImageAttachment[]) => void
  onAbort?: () => void
  disabled?: boolean
  loading?: boolean
  sessionEndpoint?: { host: string; port: number }
  sessionId?: string
  // session change callback — wired from ChatModeContent
  activeSessionId?: string | null
  onSessionChange?: (sessionId: string) => void
}

// ── Mode pill definitions ────────────────────────────────────────────────────
const CHAT_MODES: { id: string; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'chat',  label: 'Chat',  icon: <MessageSquare className="h-3 w-3" /> },
  { id: 'image', label: 'Image', icon: <ImageIcon     className="h-3 w-3" /> },
  { id: 'code',  label: 'Code',  icon: <Terminal      className="h-3 w-3" />, badge: 'soon' },
]

export function InputBox({
  onSend, onAbort, disabled, loading,
  sessionEndpoint, sessionId,
  activeSessionId, onSessionChange,
}: InputBoxProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showRemoteForm, setShowRemoteForm] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteModel, setRemoteModel] = useState('')
  const [remoteApiKey, setRemoteApiKey] = useState('')
  const [remoteConnecting, setRemoteConnecting] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const { state, setMode } = useAppState()
  const { sessions: allSessions } = useSessionsContext()
  const sessions = useMemo(() => allSessions.filter(s => !isImageSession(s)), [allSessions])

  // Active session display info
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const modelName = activeSession
    ? (activeSession.modelName || activeSession.modelPath.split('/').pop() || 'Model')
    : sessions.length > 0
      ? (sessions[0].modelName || sessions[0].modelPath.split('/').pop() || 'Model')
      : 'No model'
  const sessionStatus = activeSession?.status
  const isRunning  = sessionStatus === 'running'
  const isStandby  = sessionStatus === 'standby'
  const isLoading  = sessionStatus === 'loading'

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [message])

  // Auto-focus
  useEffect(() => {
    if (!loading && !disabled) textareaRef.current?.focus()
  }, [loading, disabled])

  // Close picker on outside click
  useEffect(() => {
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
        setShowRemoteForm(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker])

  const handleSend = () => {
    if ((message.trim() || attachments.length > 0) && !disabled) {
      onSend(message, attachments.length > 0 ? attachments : undefined)
      setMessage('')
      setAttachments([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && loading && onAbort) onAbort()
  }

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024)
    for (const file of imageFiles) {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          dataUrl: reader.result as string,
          name: file.name,
          type: file.type,
        }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems = Array.from(items).filter(i => i.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[]
    addFiles(files)
  }, [addFiles])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id))

  const handleTranscription = useCallback((text: string) => {
    setMessage(prev => prev ? prev + ' ' + text : text)
  }, [])

  const handleSelectSession = (s: SessionSummary) => {
    onSessionChange?.(s.id)
    setShowModelPicker(false)
    setShowRemoteForm(false)
  }

  const handleConnectRemote = async () => {
    if (!remoteUrl.trim() || !remoteModel.trim()) return
    setRemoteError(null)
    setRemoteConnecting(true)
    try {
      const remoteResult = await window.api.sessions.createRemote({
        remoteUrl: remoteUrl.trim(),
        remoteApiKey: remoteApiKey.trim() || undefined,
        remoteModel: remoteModel.trim(),
      })
      if (!remoteResult.success) throw new Error(remoteResult.error || 'Failed to create remote session')
      const result = await window.api.sessions.start(remoteResult.session.id)
      if (result.success) {
        onSessionChange?.(remoteResult.session.id)
        setShowRemoteForm(false)
        setShowModelPicker(false)
        setRemoteUrl('')
        setRemoteModel('')
        setRemoteApiKey('')
      } else {
        setRemoteError(result.error || 'Failed to connect')
      }
    } catch (error) {
      setRemoteError((error as Error).message)
    } finally {
      setRemoteConnecting(false)
    }
  }

  const statusDotClass = isRunning
    ? 'bg-success'
    : isStandby
    ? 'bg-blue-400'
    : isLoading
    ? 'bg-warning animate-pulse'
    : 'bg-muted-foreground/50'

  return (
    <div
      className={`relative border-t border-border bg-background transition-colors ${isDragOver ? 'bg-primary/5' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary/40 rounded-lg m-1 pointer-events-none">
          <div className="flex flex-col items-center gap-1 text-primary">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs font-medium">Drop image to attach</span>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-3">
        {/* Image attachments preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachments.map(att => (
              <div key={att.id} className="relative group">
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Main input box ─────────────────────────────────────────────── */}
        <div className="relative rounded-2xl border border-input bg-card shadow-sm focus-within:border-primary/50 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-200">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={loading ? 'Waiting for response…' : 'Message…'}
            disabled={disabled && !loading}
            className="w-full resize-none px-4 pt-3.5 pb-2 bg-transparent focus:outline-none text-sm leading-relaxed min-h-[52px] max-h-[200px]"
            rows={1}
          />

          {/* ── Bottom toolbar ─────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-3 pb-2.5">
            {/* Left: mode pills */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {CHAT_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id as any)}
                  disabled={m.id === 'code'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 ${
                    state.mode === m.id
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
                  } ${m.id === 'code' ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={m.id === 'code' ? 'Coming soon' : `Switch to ${m.label}`}
                >
                  {m.icon}
                  {m.label}
                  {m.badge && (
                    <span className="text-[8px] px-1 py-0.5 bg-muted text-muted-foreground rounded-full uppercase tracking-wide">
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-border flex-shrink-0" />

            {/* Model selector */}
            <div className="relative flex-1 min-w-0" ref={pickerRef}>
              <button
                onClick={() => setShowModelPicker(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150 max-w-full ${
                  showModelPicker
                    ? 'bg-accent border-border text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent border-transparent'
                }`}
                title="Switch model"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass}`} />
                <span className="truncate max-w-[180px]">{modelName}</span>
                <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
              </button>

              {/* Model picker dropdown */}
              {showModelPicker && (
                <div className="absolute left-0 bottom-full mb-2 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Switch Model</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {sessions.map(s => {
                      const name = s.modelName || s.modelPath.split('/').pop() || s.modelPath
                      const isActive = s.id === activeSessionId
                      const dot = s.status === 'running' ? 'bg-success'
                        : s.status === 'standby' ? 'bg-blue-400'
                        : s.status === 'loading' ? 'bg-warning animate-pulse'
                        : 'bg-muted-foreground/40'
                      return (
                        <button
                          key={s.id}
                          onClick={() => handleSelectSession(s)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-accent transition-colors ${
                            isActive ? 'bg-primary/8 text-foreground' : 'text-foreground/80'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                          <span className="flex-1 truncate font-medium">{name}</span>
                          {s.type === 'remote' && (
                            <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">Remote</span>
                          )}
                          <span className="text-[10px] text-muted-foreground capitalize">{s.status}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                    {sessions.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground text-center">No models configured</p>
                    )}
                  </div>
                  <div className="border-t border-border py-1">
                    <button
                      onClick={() => {
                        setShowModelPicker(false)
                        window.dispatchEvent(new CustomEvent('vmlx:navigate', { detail: { mode: 'server', panel: 'create' } }))
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add local model
                    </button>
                    <button
                      onClick={() => { setShowRemoteForm(v => !v); setRemoteError(null) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      Connect remote endpoint
                    </button>
                    {/* Inline remote form */}
                    {showRemoteForm && (
                      <div className="border-t border-border mx-3 mb-1 mt-1 space-y-2 pt-2">
                        <input
                          autoFocus
                          value={remoteUrl}
                          onChange={e => setRemoteUrl(e.target.value)}
                          placeholder="API URL (e.g. https://api.openai.com)"
                          className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                          value={remoteModel}
                          onChange={e => setRemoteModel(e.target.value)}
                          placeholder="Model name (e.g. gpt-4o)"
                          className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <input
                          type="password"
                          value={remoteApiKey}
                          onChange={e => setRemoteApiKey(e.target.value)}
                          placeholder="API key (optional)"
                          className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {remoteError && <p className="text-[10px] text-destructive">{remoteError}</p>}
                        <button
                          onClick={handleConnectRemote}
                          disabled={remoteConnecting || !remoteUrl.trim() || !remoteModel.trim()}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors mb-1"
                        >
                          {remoteConnecting
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Connecting…</>
                            : <><Globe className="h-3 w-3" /> Connect</>
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: attach + voice + send */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) addFiles(e.target.files) }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled && !loading}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-40 text-muted-foreground hover:text-foreground transition-colors"
                title="Attach image"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <VoiceChat
                onTranscription={handleTranscription}
                endpoint={sessionEndpoint}
                sessionId={sessionId}
                disabled={disabled && !loading}
              />
              {loading ? (
                <button
                  onClick={onAbort}
                  className="p-2 bg-foreground text-background rounded-full hover:opacity-80 transition-all flex-shrink-0"
                  title="Stop generating (Esc)"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={disabled || (!message.trim() && attachments.length === 0)}
                  className="p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-30 transition-all flex-shrink-0 shadow-sm"
                  title="Send message (Enter)"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-2">
          Enter to send · Shift+Enter for new line · Esc to stop
        </p>
      </div>
    </div>
  )
}
