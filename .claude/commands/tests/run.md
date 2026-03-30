# /tests/run — Tests: Run All Tests

Run the complete test suite (Python + TypeScript).

## Usage
`/tests/run $ARGUMENTS`

## Full Test Run
```bash
# Python engine tests
pytest tests/ -k "not Async" -v --tb=short

# Panel TypeScript tests
cd panel && npm run test

# TypeScript type check
cd panel && npm run typecheck
```

## Test Configuration
| Config | File | Notes |
|--------|------|-------|
| Python | `pytest.ini` | asyncio_mode=auto, paths=tests/ |
| TypeScript | `panel/vitest.config.ts` | Vitest runner |
| Python deps | `pyproject.toml` `[dev]` extra | pytest, pytest-asyncio, etc. |

## Test Categories
```
tests/
  test_llm.py                  LLM inference (simple + batched)
  test_mllm.py                 Vision-language model inference
  test_continuous_batching.py  Scheduler batching logic
  test_batching.py             Batch request handling
  test_batching_deterministic.py  Output reproducibility
  test_simple_engine.py        SimpleEngine mode
  test_request.py              Request dataclass validation
  test_speculative.py          Speculative decoding
  test_cache_types.py          Cache type utilities
  test_prefix_cache.py         Prefix cache
  test_paged_cache_unit.py     Paged KV cache
  test_disk_cache_unit.py      Disk cache
  test_block_disk_bfloat16.py  Block disk store precision
  test_mllm_scheduler_cache.py MLLM cache
  test_model_registry.py       Model registry
  test_model_config_registry.py Config auto-detection
  test_model_inspector.py      Model inspection
  test_jang_loader.py          JANG format loading
  test_tool_parsers.py         All 13 tool parsers
  test_native_tool_format.py   Native tool formats
  test_audio.py                TTS/STT
  test_embeddings.py           Embeddings
  test_reranker_endpoint.py    Reranking API
  test_image_gen_engine.py     Image generation
  test_health_endpoint.py      Health check endpoint
  test_api_utils.py            API utilities
  test_streaming_detokenizer.py  Streaming output
  test_streaming_latency.py    Latency measurement
  test_optimizations.py        Optimization flags
  test_jit_toggle.py           JIT compilation toggle
  test_disk_streaming.py       Disk streaming
  integration/                 Full server endpoint tests
  benchmark/                   Performance benchmarks
  evals/gsm8k/                 Math reasoning evaluation
```

## Filtering Tests
```bash
# By keyword
pytest tests/ -k "cache" -v
pytest tests/ -k "tool_parser" -v
pytest tests/ -k "llm and not mllm" -v

# By file
pytest tests/test_tool_parsers.py -v

# Stop on first failure
pytest tests/ -x

# Parallel (faster)
pytest tests/ -n auto

# Skip slow tests
pytest tests/ -m "not slow"
```

## Fixtures (conftest.py)
```python
# Common fixtures available in all tests
@pytest.fixture
def small_model():    # Tiny model for fast tests
@pytest.fixture
def server():         # Running FastAPI server instance
@pytest.fixture
def engine():         # Initialized SimpleEngine
```
