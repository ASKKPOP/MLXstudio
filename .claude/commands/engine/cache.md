# /engine/cache — Engine: Cache Management

Work with the 5-layer cache architecture: inspect, configure, debug, or extend.

## Usage
`/engine/cache $ARGUMENTS`

## Cache Architecture
```
Request → Tokens
    │
L1: Memory Prefix Cache  (vmlx_engine/prefix_cache.py)     ← LRU, fast
  OR Paged KV Cache       (vmlx_engine/paged_cache.py)      ← block-based
    │ miss
L2: Disk Cache            (vmlx_engine/disk_cache.py)       ← SSD persist
  OR Block Disk Store     (vmlx_engine/block_disk_store.py) ← block-level
    │ miss
Inference → float16 KV states
    │
KV Quantization → q4/q8 at storage boundary
    │
Store back into L1 + L2
```

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/prefix_cache.py` | L1 LRU memory cache (~79KB) |
| `vmlx_engine/paged_cache.py` | Block-based KV cache (~47KB) |
| `vmlx_engine/memory_cache.py` | Memory-pressure eviction (~30KB) |
| `vmlx_engine/disk_cache.py` | L2 SSD persistence (~23KB) |
| `vmlx_engine/block_disk_store.py` | Per-block disk storage (~35KB) |
| `vmlx_engine/mllm_cache.py` | Vision model cache (~16KB) |
| `vmlx_engine/vision_embedding_cache.py` | Vision embeddings (~7KB) |
| `vmlx_engine/utils/cache_types.py` | Cache type enums |
| `vmlx_engine/utils/mamba_cache.py` | SSM/Mamba state cache |

## Cache Stats API
```bash
# Live cache statistics
curl http://localhost:8000/v1/cache/stats

# Clear cache
curl -X POST http://localhost:8000/v1/cache/clear
```

## Server Flags for Cache
```bash
--enable-prefix-cache       L1 memory prefix cache
--use-paged-cache           Block-based paged KV cache
--kv-cache-quantization q4  Quantize stored KV to 4-bit
--kv-cache-quantization q8  Quantize stored KV to 8-bit
--enable-disk-cache         L2 disk persistence
```

## Testing Cache
```bash
pytest tests/test_prefix_cache.py -v
pytest tests/test_paged_cache_unit.py -v
pytest tests/test_disk_cache_unit.py -v
pytest tests/test_mllm_scheduler_cache.py -v
pytest tests/test_block_disk_bfloat16.py -v
pytest tests/benchmark/test_cache_perf.py -v
```

## Cache Selection Logic
| Mode | L1 Cache | L2 Cache |
|------|----------|----------|
| Simple engine | PrefixCache | — |
| Batched, no flags | PrefixCache | DiskCache (if enabled) |
| `--use-paged-cache` | PagedCache | BlockDiskStore (if enabled) |
| VLM (MLLM) | MllmCache + VisionEmbeddingCache | — |
