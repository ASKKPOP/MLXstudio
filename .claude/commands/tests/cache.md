# /tests/cache — Tests: Cache Tests

Run and work with cache system tests.

## Usage
`/tests/cache $ARGUMENTS`

## Commands
```bash
# All cache tests
pytest tests/ -k "cache" -v

# Specific cache types
pytest tests/test_prefix_cache.py -v
pytest tests/test_paged_cache_unit.py -v
pytest tests/test_disk_cache_unit.py -v
pytest tests/test_block_disk_bfloat16.py -v
pytest tests/test_mllm_scheduler_cache.py -v
pytest tests/test_cache_types.py -v

# Cache performance benchmarks
pytest tests/benchmark/test_cache_perf.py -v
```

## Test → Source Mapping
| Test File | Source Under Test |
|-----------|-------------------|
| `test_prefix_cache.py` | `prefix_cache.py`, `memory_cache.py` |
| `test_paged_cache_unit.py` | `paged_cache.py` |
| `test_disk_cache_unit.py` | `disk_cache.py` |
| `test_block_disk_bfloat16.py` | `block_disk_store.py` (bfloat16 precision) |
| `test_mllm_scheduler_cache.py` | `mllm_cache.py`, `vision_embedding_cache.py` |
| `test_cache_types.py` | `utils/cache_types.py` |
| `benchmark/test_cache_perf.py` | All cache layers, hit rates |

## What Each Test Validates
- **Prefix cache**: LRU eviction, prefix hit detection, TTL expiry
- **Paged cache**: Block allocation, deduplication (SHA-256), block reuse
- **Disk cache**: SQLite index, safetensors serialization, cache invalidation
- **Block disk**: bfloat16 precision preservation, block-level I/O
- **MLLM cache**: Vision embedding reuse, separate KV space
- **Cache types**: Enum correctness, type validation

## Cache Performance Benchmarks
```bash
pytest tests/benchmark/test_cache_perf.py -v --tb=short

# Measures:
# - Prefix cache hit rate for repeated prompts
# - Disk cache load time vs cold start
# - Memory usage under load
# - Block deduplication effectiveness
```

## Writing a Cache Test
```python
import pytest
from vmlx_engine.prefix_cache import PrefixCache

def test_cache_hit_on_repeated_prompt(small_model):
    cache = PrefixCache(model_path=small_model, max_entries=100)
    tokens = [1, 2, 3, 4, 5]

    # First access — miss
    result = cache.get(tokens)
    assert result is None

    # Store
    cache.put(tokens, kv_state=some_kv)

    # Second access — hit
    result = cache.get(tokens)
    assert result is not None
```
