# /test — Run All Tests

Run the full test suite across Python engine and Electron panel.

## Steps

1. **Python tests** (from project root)
   ```bash
   pytest tests/ -k "not Async" -v
   ```

2. **Panel unit tests**
   ```bash
   cd panel && npm run test
   ```

3. **Typecheck panel**
   ```bash
   cd panel && npm run typecheck
   ```

4. **Lint panel**
   ```bash
   cd panel && npm run lint
   ```

## Test Structure
```
tests/
  test_llm.py                    # LLM inference
  test_mllm.py                   # Vision-language models
  test_continuous_batching.py    # Batch scheduling
  test_prefix_cache.py           # Prefix cache
  test_paged_cache_unit.py       # Paged KV cache
  test_disk_cache_unit.py        # Disk cache
  test_tool_parsers.py           # Tool calling parsers
  test_audio.py                  # TTS/STT
  test_embeddings.py             # Embeddings
  test_image_gen_engine.py       # Image generation
  integration/                   # Full endpoint tests
  benchmark/                     # Performance benchmarks
  evals/gsm8k/                   # GSM8K math eval
```

## pytest.ini Configuration
- `asyncio_mode = auto`
- Test discovery in `tests/`
- Skip async tests: `-k "not Async"`

## Useful Flags
```bash
pytest tests/test_tool_parsers.py -v           # Single file
pytest tests/ -k "cache" -v                    # Filter by keyword
pytest tests/ --tb=short                        # Short tracebacks
pytest tests/ -x                               # Stop on first failure
pytest tests/ -n auto                          # Parallel (pytest-xdist)
```

## Panel Tests (Vitest)
- Config: `panel/vitest.config.ts`
- 1545+ TypeScript tests
- `npm run test:watch` for interactive mode
