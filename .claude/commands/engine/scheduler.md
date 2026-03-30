# /engine/scheduler — Engine: Request Scheduler

Analyze and work with the continuous batching schedulers.

## Usage
`/engine/scheduler $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/scheduler.py` | LLM scheduler (~177KB) |
| `vmlx_engine/mllm_scheduler.py` | VLM/multimodal scheduler (~105KB) |
| `vmlx_engine/mllm_batch_generator.py` | VLM batch generation (~111KB) |
| `vmlx_engine/engine_core.py` | Engine coordination (~28KB) |
| `vmlx_engine/output_collector.py` | Async output collection (~8KB) |
| `vmlx_engine/request.py` | Request + SamplingParams dataclasses |
| `vmlx_engine/worker.py` | Worker process management |

## Architecture

### LLM Scheduler (`scheduler.py`)
```
Request arrives → waiting_queue
    │
Scheduler tick → select batch (up to max_batch_size)
    │
  prefill phase → compute KV cache for prompt tokens
    │
  decode phase  → generate one token per request per step
    │
Request done   → output_collector → stream to client
```

### MLLM Scheduler (`mllm_scheduler.py`)
```
Request + images → waiting_queue
    │
Vision encoding → embed images to tokens
    │
3-tier cache selection:
  memory_cache | paged_cache | prefix_cache
  + optional disk cache (L2)
    │
prefill + decode (same as LLM scheduler)
```

## Key Configuration (serve flags)
```bash
--continuous-batching     Enable scheduler (off = SimpleEngine)
--max-batch-size N        Max concurrent requests in batch
--max-model-len N         Max context length per request
```

## Request Lifecycle States
```
WAITING → RUNNING → FINISHED
           ↓
        PREEMPTED (if memory pressure)
```

## Testing Scheduler
```bash
pytest tests/test_continuous_batching.py -v
pytest tests/test_batching.py -v
pytest tests/test_mllm_scheduler_cache.py -v
pytest tests/test_batching_deterministic.py -v
```

## Debugging Scheduler
Enable DEBUG logging:
```bash
vmlx serve <model> --continuous-batching --log-level DEBUG
```

Look for log lines:
- `Scheduler: batch_size=N, waiting=M`
- `Prefill: N tokens in X ms`
- `Decode step: N tokens at X tok/s`
