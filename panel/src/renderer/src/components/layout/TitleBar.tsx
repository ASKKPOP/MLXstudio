import { useAppState } from '../../contexts/AppStateContext'
import { PanelLeft } from 'lucide-react'
import { useTranslation } from '../../i18n'

export function TitleBar() {
  const { state, dispatch } = useAppState()
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center h-10 bg-card border-b border-border flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS traffic light spacer */}
      <div className="w-[72px] flex-shrink-0" />

      {/* Sidebar re-open button — only when collapsed */}
      {state.sidebarCollapsed && (
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors ml-1"
            title={t('app.sidebar.show')}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Drag fills center */}
      <div className="flex-1" />

      {/* Right side — nothing needed: theme/lang/about all moved to sidebar */}
    </div>
  )
}
