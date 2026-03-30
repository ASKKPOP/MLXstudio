# /docs/api-ref — Docs: API Reference

View or update the complete API reference documentation.

## Usage
`/docs/api-ref $ARGUMENTS`

## API Reference Location
```
docs/guides/server.md           Full endpoint usage guide
docs/reference/configuration.md All server flags and options
docs/reference/cli.md           CLI command reference
docs/api/cancellation.md        Request cancellation
README.md                       Quick reference table
```

## Complete Endpoint Reference

### Text Generation
```
POST /v1/chat/completions      OpenAI Chat Completions
POST /v1/messages              Anthropic Messages
POST /v1/responses             OpenAI Responses (agentic)
POST /v1/completions           Legacy text completions
```

### Multimodal
```
POST /v1/images/generations    Image generation
POST /v1/images/edits          Image editing
POST /v1/audio/speech          TTS (Kokoro)
POST /v1/audio/transcriptions  STT (Whisper)
POST /v1/audio/translations    STT + translate to English
```

### Retrieval & Utility
```
POST /v1/embeddings            Text embeddings
POST /v1/rerank                Document reranking
GET  /v1/models                List loaded models
GET  /health                   Server health
GET  /v1/cache/stats           Cache statistics
POST /v1/cache/clear           Clear cache
```

### Ollama Compatible
```
POST /api/chat                 NDJSON chat
POST /api/generate             NDJSON completion
GET  /api/tags                 List models
POST /api/show                 Model details
POST /api/embeddings           Embeddings
```

## Request Parameters (Chat Completions)
```json
{
  "model": "local",
  "messages": [...],
  "stream": true,
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 2048,
  "stop": ["</s>"],
  "tools": [...],
  "tool_choice": "auto",
  "enable_thinking": true,
  "repetition_penalty": 1.1,
  "min_p": 0.05
}
```

## Streaming Response Format (SSE)
```
data: {"choices": [{"delta": {"role": "assistant"}, "index": 0}]}
data: {"choices": [{"delta": {"content": "Hello"}, "index": 0}]}
data: {"choices": [{"delta": {"reasoning_content": "..."}, "index": 0}]}
data: {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}
data: [DONE]
```

## CLI Reference
```bash
vmlx serve <model> [OPTIONS]   Start inference server
vmlx convert <model> [OPTIONS] Convert/quantize model
vmlx bench <model> [OPTIONS]   Run benchmarks
vmlx info <model>              Show model metadata
vmlx list                      List available models
vmlx doctor [model]            System diagnostics
```

## Updating API Docs
1. When adding an endpoint to `vmlx_engine/server.py`
2. Add Pydantic schema in `vmlx_engine/api/models.py`
3. Update `docs/guides/server.md` with examples
4. Update the endpoint table in `README.md`
5. Add code snippet in `panel/src/renderer/src/components/api/CodeSnippets.tsx`
