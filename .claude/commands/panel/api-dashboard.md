# /panel/api-dashboard — Panel: API Dashboard

Work with the API documentation and code snippet components.

## Usage
`/panel/api-dashboard`

## Source Files
```
panel/src/renderer/src/components/api/
  ApiDashboard.tsx           Main API tab layout
  EndpointList.tsx           Lists all available endpoints
  CodeSnippets.tsx           Copy-pasteable code examples
  CodingToolIntegration.tsx  Coding tool UI

panel/src/main/ipc/coding-tools.ts (~15KB)  Coding tool IPC
panel/src/main/api-gateway.ts               Multi-model gateway client
```

## API Dashboard Features
1. **Live endpoint reference** — all endpoints with descriptions
2. **Code snippets** — Python (OpenAI SDK), curl, JavaScript examples
3. **Gateway URL** — single port routing all loaded models
4. **Copy button** — one-click copy for any snippet

## API Gateway
The gateway runs on a configurable port (default `8080`) and routes requests to all running sessions by model name:
```bash
# Request to gateway routes to the matching session
curl http://localhost:8080/v1/chat/completions \
  -d '{"model": "Qwen3-8B", "messages": [...]}'
```

Implemented in: `panel/src/main/api-gateway.ts`

## Adding a New Endpoint to Dashboard
1. Add endpoint definition in `EndpointList.tsx`:
   ```typescript
   { method: 'POST', path: '/v1/myendpoint', description: '...' }
   ```
2. Add code snippet in `CodeSnippets.tsx`:
   ```typescript
   case 'myendpoint':
     return `curl http://localhost:${port}/v1/myendpoint \\ ...`
   ```
3. Implement actual endpoint in `vmlx_engine/server.py`

## Coding Tool Integration
The coding tools tab shows integrated tools available when agentic mode is active:
- File read/write/list
- Bash execution
- Web search/fetch
- Git operations

Implemented in:
- `panel/src/main/tools/registry.ts` — tool definitions
- `panel/src/main/tools/executor.ts` — tool execution
- `panel/src/main/ipc/coding-tools.ts` — IPC bridge
