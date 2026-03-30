# /analyze — Analyze Project

Perform multi-dimensional analysis of the MLXStudio project.

## Analysis Targets

Specify a target: `$ARGUMENTS`

### Examples
- `/analyze` — full project overview
- `/analyze engine` — inference engine deep-dive
- `/analyze panel` — Electron app analysis
- `/analyze cache` — cache architecture
- `/analyze performance` — performance bottlenecks
- `/analyze security` — security review
- `/analyze @vmlx_engine/scheduler.py` — specific file

## Key Analysis Areas

### Engine Architecture
- `vmlx_engine/engine/` — SimpleEngine vs BatchedEngine
- `vmlx_engine/scheduler.py` — continuous batching logic
- `vmlx_engine/mllm_scheduler.py` — multimodal scheduling
- `vmlx_engine/server.py` — FastAPI endpoints and request flow

### Cache Stack (5 layers)
- `vmlx_engine/prefix_cache.py` — L1 memory LRU
- `vmlx_engine/paged_cache.py` — block-based KV
- `vmlx_engine/memory_cache.py` — memory-aware eviction
- `vmlx_engine/disk_cache.py` — L2 SSD persistence
- `vmlx_engine/block_disk_store.py` — block-level disk

### Tool & Reasoning Parsers
- `vmlx_engine/tool_parsers/` — 13 parsers for different model formats
- `vmlx_engine/reasoning/` — think-block extractors

### Panel Architecture
- `panel/src/main/` — Electron main process (IPC, DB, sessions)
- `panel/src/renderer/src/` — React UI components
- `panel/src/preload/index.ts` — contextBridge IPC bridge

## Auto-Activates
- `--persona-analyzer` for investigation
- `--persona-architect` for architectural analysis
- `--seq` for systematic multi-step analysis
- `--think` for complex modules (scheduler, paged_cache)
