# /engine/serve — Engine: Serve Model

Start the vMLX inference engine for a specific model.

## Usage
`/engine/serve $ARGUMENTS`

## Entry Point
`vmlx_engine/cli.py` → `serve_command()`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/cli.py` | CLI entry point, argument parsing |
| `vmlx_engine/server.py` | FastAPI app, all endpoints (~262KB) |
| `vmlx_engine/engine/simple.py` | SimpleEngine (single-user) |
| `vmlx_engine/engine/batched.py` | BatchedEngine (multi-user) |
| `vmlx_engine/engine_core.py` | Engine coordination layer |
| `vmlx_engine/scheduler.py` | LLM continuous batching |
| `vmlx_engine/mllm_scheduler.py` | VLM continuous batching |
| `vmlx_engine/model_config_registry.py` | Auto-detect model config |

## Quick Commands
```bash
# Minimal start
vmlx serve <model>

# Production-grade
vmlx serve <model> \
  --continuous-batching \
  --use-paged-cache \
  --kv-cache-quantization q8 \
  --enable-disk-cache \
  --enable-prefix-cache \
  --port 8000

# With API key
vmlx serve <model> --api-key sk-local --port 8000

# Max context
vmlx serve <model> --max-model-len 32768 --port 8000
```

## All Serve Flags
```
--host              Bind address (default: 0.0.0.0)
--port              Port (default: 8000)
--api-key           Optional auth token
--continuous-batching Enable batched engine
--enable-prefix-cache L1 memory prefix cache
--use-paged-cache   Block-based KV cache
--kv-cache-quantization q4|q8
--enable-disk-cache L2 SSD persistence
--enable-jit        Metal JIT compilation
--speculative-model Draft model path
--enable-pld        Prompt lookup decoding
--tool-call-parser  auto|qwen|llama|mistral|...
--reasoning-parser  auto|qwen3|deepseek_r1|...
--max-model-len     Max context tokens
--log-level         DEBUG|INFO|WARNING|ERROR
--cors-origins      Allowed origins (default: *)
```

## Engine Selection Logic
```
--continuous-batching → BatchedEngine
  ├── --use-paged-cache → PagedCache + optional BlockDiskStore
  └── default → PrefixCache + optional DiskCache
default (no flag) → SimpleEngine (max throughput, single user)
```
