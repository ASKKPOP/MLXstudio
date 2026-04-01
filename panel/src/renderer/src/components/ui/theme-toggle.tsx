import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../providers/ThemeProvider'
import { Button } from './button'

/** Minimal SVG icon that evokes Claude's warm terracotta logomark */
function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Two overlapping warm diamond shapes — echoes Claude's icon */}
      <path
        d="M7 1.5 L11 7 L7 12.5 L3 7 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M1.5 7 L7 3 L12.5 7 L7 11 Z"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycle = () => {
    const order = ['dark', 'light', 'claude', 'system'] as const
    const idx = order.indexOf(theme as typeof order[number])
    setTheme(order[(idx + 1) % order.length])
  }

  const label =
    theme === 'dark' ? 'Theme: Dark' :
    theme === 'light' ? 'Theme: Light' :
    theme === 'claude' ? 'Theme: Claude' :
    'Theme: System'

  return (
    <Button variant="ghost" size="icon" onClick={cycle} className="h-6 w-6" title={label}>
      {theme === 'dark'   && <Moon        className="h-3.5 w-3.5" />}
      {theme === 'light'  && <Sun         className="h-3.5 w-3.5" />}
      {theme === 'claude' && <ClaudeIcon  className="h-3.5 w-3.5" />}
      {theme === 'system' && <Monitor     className="h-3.5 w-3.5" />}
    </Button>
  )
}
