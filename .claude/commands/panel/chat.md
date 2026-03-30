# /panel/chat — Panel: Chat Interface

Work with the chat UI components and IPC layer.

## Usage
`/panel/chat $ARGUMENTS`

## Source Files
```
panel/src/renderer/src/components/chat/
  ChatInterface.tsx      Main chat UI layout
  MessageList.tsx        Renders message thread
  MessageBubble.tsx      Single message (Markdown, code highlighting)
  InputBox.tsx           Text input + file/image upload
  ChatSettings.tsx       Temperature, top-p, max-tokens controls
  VoiceChat.tsx          STT/TTS integration
  InlineToolCall.tsx     Inline tool call display
  ToolCallStatus.tsx     Tool execution progress
  ReasoningBox.tsx       <think> block display
  ChatList.tsx           Chat history list
  chat-utils.ts          Helper functions

panel/src/main/ipc/chat.ts     IPC handler (~105KB) — all chat logic
panel/src/main/database.ts     Chat history persistence
panel/src/shared/sessionUtils.ts  Shared session utilities
```

## Data Flow
```
User types → InputBox.tsx
    │
window.api.chat.sendMessage()  [preload bridge]
    │
ipcMain: 'chat:send-message'   [main/ipc/chat.ts]
    │
HTTP POST /v1/chat/completions [vmlx engine]
    │
SSE stream → ipcRenderer events
    │
MessageList.tsx → streaming token updates
    │
ReasoningBox.tsx (if thinking model)
InlineToolCall.tsx (if tool calls detected)
```

## IPC Channels (chat.ts)
```typescript
chat:send-message        // Send a new message
chat:stop-generation     // Cancel in-progress generation
chat:get-history         // Load previous messages
chat:delete-message      // Delete a message
chat:export              // Export chat to JSON/MD
chat:clear               // Clear all messages in chat
```

## Key State
```typescript
// AppStateContext.tsx
currentChatId: string
streamingMessageId: string | null
isGenerating: boolean

// SessionsContext.tsx
sessions: Session[]
activeSession: Session | null
```

## Adding a New Chat Feature
1. Add UI in `components/chat/`
2. Add IPC channel in `main/ipc/chat.ts`
3. Expose in `preload/index.ts` via `contextBridge`
4. Connect to renderer via `window.api.chat.*`
5. Store persistent data via `main/database.ts`

## Chat Settings (per-chat overrides)
Stored in SQLite: `chat_overrides` table
- `temperature`, `top_p`, `max_tokens`
- `system_prompt`
- `enable_thinking`
- `tool_call_parser`
