# /docs/generate — Docs: Generate / Update Documentation

Generate or update project documentation.

## Usage
`/docs/generate $ARGUMENTS`

## Documentation Structure
```
docs/
  README.md                    Main project overview
  ARCHITECTURE.md              System architecture diagrams
  CACHE-INNOVATION-ROADMAP.md  Cache implementation roadmap
  CROSS-CHECK-MATRIX.md        Feature matrix

  getting-started/
    installation.md            Install guide
    quickstart.md              5-minute quickstart

  guides/
    server.md                  Running the server
    python-api.md              Python API usage
    tool-calling.md            Tool calling
    mcp-tools.md               MCP integration
    reasoning.md               Reasoning models
    multimodal.md              Vision-language models
    audio.md                   TTS/STT
    embeddings.md              Text embeddings
    continuous-batching.md     Batching architecture
    api-compatibility.md       API compatibility

  benchmarks/
    README.md, llm.md, mllm.md, audio.md, image.md, video.md

  development/
    architecture.md            Dev architecture
    build-test-deploy.md       Build + deploy guide
    contributing.md            Contribution guidelines

  reference/
    cli.md                     CLI command reference
    configuration.md           All config options
    models.md                  Supported model list

  api/
    cancellation.md            Request cancellation
```

## Common Documentation Tasks

### Update CLI reference
```bash
# Auto-generate from cli.py
vmlx --help > /tmp/help.txt
# Then update docs/reference/cli.md manually with the output
```

### Update model list
When adding support for new models, update `docs/reference/models.md`

### Update API reference
When adding new endpoints, update:
- `docs/guides/server.md` (usage examples)
- `docs/api/` (endpoint details)
- `README.md` API table

### Update architecture
When changing system design, update:
- `docs/ARCHITECTURE.md`
- `docs/development/architecture.md`

## Writing Good Docs
1. Lead with a working code example
2. Include all config flags for the feature
3. Add a "Common Issues" section
4. Cross-reference related guides
5. Keep README.md in sync with docs/

## Persona
Auto-activates `--persona-scribe` for documentation tasks.
Use `--persona-mentor` for tutorial-style guides.
