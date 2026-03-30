# /tests/benchmark — Tests: Performance Benchmarks

Run performance benchmarks and profiling tests.

## Usage
`/tests/benchmark $ARGUMENTS`

## Commands
```bash
# All benchmark tests
pytest tests/benchmark/ -v

# Cache performance
pytest tests/benchmark/test_cache_perf.py -v

# PLD (Prompt Lookup Decoding) acceptance rate
pytest tests/benchmark/test_pld_acceptance.py -v
pytest tests/benchmark/test_pld_openclaw.py -v

# bfloat16 precision
pytest tests/benchmark/test_bfloat16_precision.py -v

# CLI benchmark
vmlx bench <model> --num-prompts 20

# Streaming latency
pytest tests/test_streaming_latency.py -v
```

## Benchmark Files
```
tests/benchmark/
  test_cache_perf.py          Cache hit rates + speedup measurements
  test_pld_acceptance.py      PLD token acceptance rate
  test_pld_openclaw.py        OpenClaw-format PLD benchmark
  test_bfloat16_precision.py  Numerical precision (bfloat16 vs float16)

tests/test_streaming_latency.py   TTFT + decode latency
tests/evals/gsm8k/gsm8k_eval.py  GSM8K math eval (accuracy)
```

## CLI Benchmark
```bash
vmlx bench mlx-community/Qwen3-8B-4bit \
  --num-prompts 20 \
  --max-tokens 200 \
  --continuous-batching

# Output:
# Throughput: 45.2 tok/s
# TTFT p50: 120ms, p95: 340ms
# Decode speed: 58.1 tok/s
# Peak memory: 8.2 GB
```

## Key Metrics
| Metric | Description |
|--------|-------------|
| **Throughput** | Total tokens/second across all requests |
| **TTFT** | Time-to-first-token (prefill latency) |
| **Decode speed** | Tokens/second during generation |
| **Cache hit rate** | % of requests with prefix cache hits |
| **Memory** | Peak GPU unified memory usage |
| **PLD acceptance** | % of n-gram tokens accepted (higher = faster) |

## GSM8K Math Eval
```bash
cd tests/evals/gsm8k
python gsm8k_eval.py \
  --model-url http://localhost:8000 \
  --num-samples 200
# Reports: accuracy % on math word problems
```

## Adding a Benchmark
```python
# tests/benchmark/test_my_feature.py
import time
import pytest

def test_my_feature_throughput(running_server):
    start = time.time()
    tokens_generated = run_requests(running_server, num=20)
    elapsed = time.time() - start
    throughput = tokens_generated / elapsed
    print(f"Throughput: {throughput:.1f} tok/s")
    assert throughput > 10  # baseline threshold
```
