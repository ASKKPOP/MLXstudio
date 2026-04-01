import { useState, useEffect, useMemo } from 'react'
import { Settings, Server, Play, Square, Loader2, X, RotateCw } from 'lucide-react'
import { ChatSettings } from '../chat/ChatSettings'
import { ServerSettingsDrawer } from '../sessions/ServerSettingsDrawer'
import { useSessionsContext } from '../../contexts/SessionsContext'
import { isImageSession } from '../../../../shared/sessionUtils'

interface ChatModeToolbarProps {
  activeChatId: string | null
  activeSessionId: string | null
  onOverridesChanged?: () => void
}

interface SessionDetail {
  id: string
  modelPath: string
  modelName?: string
  host: string
  port: number
  pid?: number
  status: 'running' | 'stopped' | 'error' | 'loading' | 'standby'
  config: string
  type?: 'local' | 'remote'
  remoteUrl?: string
  remoteModel?: string
}

export function ChatModeToolbar({ activeChatId, activeSessionId, onOverridesChanged }: ChatModeToolbarProps) {
  const { sessions: allSessions } = useSessionsContext()

  // Filter out image sessions — they belong in the Image tab, not chat
  const sessions = useMemo(() => allSessions.filter(s => !isImageSession(s)), [allSessions])

  const [showChatSettings, setShowChatSettings] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null)
  const [effectiveReasoningParser, setEffectiveReasoningParser] = useState<string | undefined>(undefined)

  // Load full session detail when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setSessionDetail(null)
      return
    }
    window.api.sessions.get(activeSessionId).then((s: SessionDetail | null) => {
      setSessionDetail(s)
      if (s) {
        try {
          const cfg = s.config ? JSON.parse(s.config) : {}
          if (cfg.reasoningParser && cfg.reasoningParser !== 'auto') {
            setEffectiveReasoningParser(cfg.reasoningParser)
          } else if (!s.modelPath.startsWith('remote://')) {
            window.api.models.detectConfig(s.modelPath).then((detected: any) => {
              setEffectiveReasoningParser(detected?.reasoningParser || undefined)
            }).catch((err) => console.error('Failed to load session info:', err))
          }
        } catch { /* ignore */ }
      }
    }).catch((err) => console.error('Failed to load session info:', err))
  }, [activeSessionId])

  // Keep session status in sync via context
  const contextSession = sessions.find(s => s.id === activeSessionId)
  const displaySession = sessionDetail
    ? { ...sessionDetail, status: contextSession?.status || sessionDetail.status, port: contextSession?.port || sessionDetail.port }
    : null

  const isRemote = displaySession?.type === 'remote'
  const isRunning = displaySession?.status === 'running'
  const isLoading = displaySession?.status === 'loading'
  const isError = displaySession?.status === 'error'
  const isStopped = displaySession?.status === 'stopped' || isError

  const handleStart = async () => {
    if (!activeSessionId) return
    await window.api.sessions.start(activeSessionId)
  }

  const handleStop = async () => {
    if (!activeSessionId) return
    await window.api.sessions.stop(activeSessionId)
  }

  // No chat selected — don't render toolbar
  if (!activeChatId) return null

  return (
    <>
      {/* Compact transparent toolbar placed at the top right */}
      <div className="absolute top-0 right-0 p-3 flex items-center gap-2 z-10 pointer-events-auto">

        {/* Start / Stop / Restart controls */}
        {displaySession && (
          <div className="flex items-center gap-1">
            {isError && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 transition-colors shadow-sm"
                title={isRemote ? 'Reconnect' : 'Restart model'}
              >
                <RotateCw className="h-3 w-3" />
                {isRemote ? 'Reconnect' : 'Restart'}
              </button>
            )}
            {isStopped && !isError && (
              <button
                onClick={handleStart}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-success text-success-foreground hover:bg-success/90 transition-colors shadow-sm"
                title={isRemote ? 'Connect' : 'Start model'}
              >
                <Play className="h-3 w-3" />
                {isRemote ? 'Connect' : 'Start'}
              </button>
            )}
            {isLoading && (
              <div className="flex bg-background/80 backdrop-blur-md rounded border border-border overflow-hidden shadow-sm">
                <span className="flex items-center gap-1 text-xs px-2 py-1 text-warning">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {isRemote ? 'Connecting...' : 'Loading...'}
                </span>
                <button
                  onClick={handleStop}
                  className="text-xs px-1.5 py-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border-l border-border"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {isRunning && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded text-muted-foreground bg-background/80 backdrop-blur-md border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors shadow-sm"
                title={isRemote ? 'Disconnect' : 'Stop model'}
              >
                <Square className="h-3 w-3" />
                {isRemote ? 'Disconnect' : 'Stop'}
              </button>
            )}
          </div>
        )}

        {/* Settings buttons */}
        {displaySession && (
          <div className="flex items-center gap-1 flex-shrink-0 bg-background/80 backdrop-blur-md rounded border border-border shadow-sm p-0.5">
            <button
              onClick={() => { setShowChatSettings(!showChatSettings); setShowServerSettings(false) }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                showChatSettings ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              title="Chat inference settings (temperature, system prompt, tools, etc.)"
            >
              <Settings className="h-3 w-3" />
              Chat
            </button>
            <button
              onClick={() => { setShowServerSettings(!showServerSettings); setShowChatSettings(false) }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                showServerSettings ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              title={isRemote ? 'Connection settings' : 'Server settings'}
            >
              <Server className="h-3 w-3" />
              {isRemote ? 'Connection' : 'Server'}
            </button>
          </div>
        )}
      </div>

      {/* Settings drawers */}
      {showChatSettings && activeChatId && displaySession && (
        <div className="absolute right-0 top-0 bottom-0 z-20">
          <ChatSettings
            chatId={activeChatId}
            session={{
              modelName: displaySession.modelName,
              modelPath: displaySession.modelPath,
              host: displaySession.host,
              port: displaySession.port,
              status: displaySession.status,
              pid: displaySession.pid,
              type: displaySession.type,
              remoteUrl: displaySession.remoteUrl,
              modelType: (() => { try { return JSON.parse(displaySession.config || '{}').modelType } catch { return undefined } })(),
            }}
            reasoningParser={effectiveReasoningParser}
            onClose={() => setShowChatSettings(false)}
            onOverridesChanged={onOverridesChanged}
          />
        </div>
      )}
      {showServerSettings && displaySession && (
        <div className="absolute right-0 top-0 bottom-0 z-20">
          <ServerSettingsDrawer
            session={displaySession}
            isRemote={isRemote}
            onClose={() => setShowServerSettings(false)}
            onSessionUpdate={async () => {
              const s = await window.api.sessions.get(activeSessionId!)
              if (s) setSessionDetail(s)
            }}
          />
        </div>
      )}
    </>
  )
}
