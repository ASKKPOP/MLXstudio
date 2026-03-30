# /serve — Start Inference Server

Start the vMLX inference server for a given model.

## Usage
`/serve $ARGUMENTS`

Examples:
- `/serve mlx-community/Qwen3-8B-4bit`
- `/serve mlx-community/Llama-3.2-3B-Instruct-4bit --port 8001`
- `/serve schnell` (image generation)
- `/serve kokoro` (TTS)

## Commands

### Basic serve
```bash
vmlx serve <model> --port 8000
```

### With continuous batching (multi-user)
```bash
vmlx serve <model> \
  --continuous-batching \
  --enable-prefix-cache \
  --port 8000
```

### With paged KV cache + disk cache (long context)
```bash
vmlx serve <model> \
  --continuous-batching \
  --use-paged-cache \
  --kv-cache-quantization q8 \
  --enable-disk-cache \
  --port 8000
```

### With speculative decoding
```bash
vmlx serve <model> \
  --speculative-model mlx-community/Qwen3-0.6B-4bit \
  --port 8000
```

### Image generation
```bash
vmlx serve schnell --port 8001
vmlx serve dev --port 8001
vmlx serve qwen-image-edit --port 8001
```

### Audio
```bash
vmlx serve kokoro --port 8002    # TTS
vmlx serve whisper --port 8003   # STT
```

## Key Source Files
- `vmlx_engine/cli.py` — `serve_command()` entry point
- `vmlx_engine/server.py` — FastAPI app and all endpoints
- `vmlx_engine/engine/simple.py` — SimpleEngine
- `vmlx_engine/engine/batched.py` — BatchedEngine

## Endpoints After Start
- `GET  http://localhost:8000/health`
- `POST http://localhost:8000/v1/chat/completions`
- `POST http://localhost:8000/v1/messages` (Anthropic)
- `GET  http://localhost:8000/v1/models`
- `GET  http://localhost:8000/v1/cache/stats`
