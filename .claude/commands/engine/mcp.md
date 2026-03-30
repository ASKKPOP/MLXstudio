# /engine/mcp — Engine: Model Context Protocol (MCP)

Work with MCP server integration for external tool access.

## Usage
`/engine/mcp $ARGUMENTS`

## Source Files
```
vmlx_engine/mcp/
  client.py      Connects to individual MCP servers (stdio/SSE)
  manager.py     Manages multiple MCP server connections
  tools.py       Exposes MCP tools as callable functions
  executor.py    Executes MCP tools, handles results
  config.py      MCP server configuration and discovery
  security.py    Sandboxing and permission checks
  types.py       Pydantic models for MCP data structures
  __init__.py    Subsystem init
```

## Configure MCP Servers
Create `mcp.json` (see `mcp.example.json` for reference):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "transport": "stdio"
    },
    "web-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {"BRAVE_API_KEY": "your-key"},
      "transport": "stdio"
    }
  }
}
```

## Start Server with MCP
```bash
vmlx serve <model> --mcp-config ./mcp.json --port 8000
```

## MCP Transport Types
| Type | Description | Use Case |
|------|-------------|----------|
| `stdio` | Subprocess stdin/stdout | Local tool servers |
| `sse` | Server-Sent Events | Remote MCP servers |

## Built-in Agentic Tools (panel)
The desktop app includes 30 built-in tools:
- File operations (read, write, list, search)
- Web search and fetch
- Git operations
- Terminal/bash execution
- Code execution (Python, JS)

Located in: `panel/src/main/tools/registry.ts`, `panel/src/main/tools/executor.ts`

## MCP Security
`vmlx_engine/mcp/security.py` enforces:
- Path traversal prevention
- Shell injection protection
- Tool whitelist/blacklist
- Permission-based access control

## Testing MCP
```bash
# Integration test with a running MCP server
pytest tests/integration/ -k "mcp" -v
```
