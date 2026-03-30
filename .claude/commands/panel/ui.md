# /panel/ui — Panel: UI Components

Work with the React UI component library and design system.

## Usage
`/panel/ui $ARGUMENTS`

## Tech Stack
| Library | Version | Role |
|---------|---------|------|
| React | 18.2 | UI framework |
| TypeScript | 5.3.3 | Type safety |
| Tailwind CSS | 3.4.1 | Utility-first styling |
| Radix UI | latest | Accessible primitives |
| Shadcn/UI | — | Component library built on Radix |
| lucide-react | 0.577 | Icons |
| marked | 12.0.2 | Markdown rendering |
| DOMPurify | 3.3.1 | XSS sanitization |

## Component Directory Structure
```
panel/src/renderer/src/components/
  ui/                     Base UI components (Shadcn/Radix wrappers)
    button.tsx            Button variants
    dialog.tsx            Modal dialogs
    select.tsx            Dropdown selects
    slider.tsx            Range sliders
    input.tsx             Text inputs
    textarea.tsx          Multi-line text
    dropdown-menu.tsx     Context menus
    tabs.tsx              Tab navigation
    toast.tsx             Notifications
    badge.tsx             Status badges
    ...

  chat/                   Chat-specific components
  image/                  Image generation UI
  sessions/               Session management UI
  api/                    API dashboard UI
  tools/                  Developer tools UI
  layout/                 App layout (sidebar, titlebar)
  setup/                  First-run setup wizard
```

## Adding a New Component

### Shadcn component (from registry)
```bash
cd panel
npx shadcn-ui@latest add <component-name>
# Generates into src/renderer/src/components/ui/
```

### Custom component
1. Create `components/myfeature/MyComponent.tsx`
2. Use Tailwind classes for styling
3. Import Radix primitives for accessibility
4. Export from module index if needed

## Styling Conventions
```tsx
// Tailwind utility classes
<div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background">

// Dark mode
<div className="bg-white dark:bg-gray-900">

// Conditional classes (clsx/cn)
import { cn } from '@/lib/utils'
<div className={cn('base-class', isActive && 'active-class')}>
```

## Internationalization (i18n)
```
panel/src/renderer/src/i18n/
  en.json    English (default)
  zh.json    Chinese
  ja.json    Japanese
  ko.json    Korean
```

```typescript
import { t } from '@/i18n'
<span>{t('session.create')}</span>
```

## Icon Usage
```typescript
import { Cpu, MessageSquare, Settings } from 'lucide-react'
<Cpu className="w-4 h-4" />
```

## Markdown Rendering
Messages use `marked` + `DOMPurify`:
```typescript
// In MessageBubble.tsx
const html = DOMPurify.sanitize(marked(content))
<div dangerouslySetInnerHTML={{ __html: html }} />
```
