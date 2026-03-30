# /engine/api — Engine: API Server & Endpoints

Work with the FastAPI server, endpoints, and API compatibility layers.

## Usage
`/engine/api $ARGUMENTS`

## Source Files
```
vmlx_engine/server.py              Main FastAPI app (~262KB)
vmlx_engine/api/
  models.py                        Pydantic request/response schemas
  streaming.py                     SSE streaming logic
  tool_calling.py                  Tool parameter parsing
  anthropic_adapter.py             Anthropic → OpenAI format adapter
  ollama_adapter.py                Ollama → OpenAI format adapter
  utils.py                         Common API helpers
```

## Endpoint Reference

### Text Generation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI chat (streaming + non) |
| POST | `/v1/messages` | Anthropic Messages API |
| POST | `/v1/responses` | OpenAI Responses API (agentic) |
| POST | `/v1/completions` | Legacy text completions |

### Multimodal
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/images/generations` | Image generation |
| POST | `/v1/images/edits` | Image editing |
| POST | `/v1/audio/speech` | TTS |
| POST | `/v1/audio/transcriptions` | STT |

### Utility
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/models` | List loaded models |
| GET | `/health` | Server health + queue stats |
| GET | `/v1/cache/stats` | Cache statistics |
| POST | `/v1/embeddings` | Text embeddings |
| POST | `/v1/rerank` | Document reranking |

### Ollama Compatible
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | NDJSON streaming chat |
| POST | `/api/generate` | NDJSON text generation |
| GET | `/api/tags` | List models |
| POST | `/api/show` | Model details |
| POST | `/api/embeddings` | Embeddings |

## Adding a New Endpoint
1. Define Pydantic schema in `vmlx_engine/api/models.py`
2. Add route in `vmlx_engine/server.py`
3. Implement handler (streaming or non-streaming)
4. Add test in `tests/integration/test_server_endpoints.py`

## Rate Limiting
```bash
vmlx serve <model> \
  --rate-limit 60 \          # Max requests/minute per IP
  --rate-limit-burst 10      # Burst allowance
```

## API Key Auth
```bash
vmlx serve <model> --api-key sk-localkey

# Client usage
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer sk-localkey" \
  -d '{"model": "local", "messages": [...]}'
```

## Testing API
```bash
pytest tests/integration/test_server_endpoints.py -v
pytest tests/test_health_endpoint.py -v
pytest tests/test_api_utils.py -v
```
