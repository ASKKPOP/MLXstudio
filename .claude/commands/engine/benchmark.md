# /engine/benchmark — Engine: Benchmark

Run performance benchmarks on models and cache configurations.

## Usage
`/engine/benchmark $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/benchmark.py` | Core benchmark logic (~55KB) |
| `vmlx_engine/cli.py` | `bench_command()` CLI entry |
| `tests/benchmark/test_cache_perf.py` | Cache performance tests |
| `tests/benchmark/test_pld_acceptance.py` | PLD acceptance tests |
| `tests/benchmark/test_pld_openclaw.py` | OpenClaw benchmark |
| `tests/benchmark/test_bfloat16_precision.py` | Precision benchmarks |

## Quick Commands
```bash
# Basic throughput benchmark
vmlx bench <model> --num-prompts 10

# With continuous batching
vmlx bench <model> --num-prompts 20 --continuous-batching

# Benchmark specific cache type
vmlx bench <model> --use-paged-cache --num-prompts 10

# Run cache performance tests
pytest tests/benchmark/test_cache_perf.py -v

# Run all benchmarks
pytest tests/benchmark/ -v
```

## Key Metrics Collected
- **Throughput**: tokens/second (prefill + decode)
- **TTFT**: Time-To-First-Token latency
- **Decode speed**: tokens/second per request
- **Memory**: peak GPU memory usage
- **Cache hit rate**: prefix/paged cache effectiveness

## Benchmark Configuration
The benchmark module tests:
1. Single-request latency (SimpleEngine)
2. Multi-request throughput (BatchedEngine)
3. Cache warmup + hit rate
4. Speculative decoding speedup
5. Prompt lookup decoding (PLD) acceptance rate

## Adding a New Benchmark
1. Create `tests/benchmark/test_my_feature.py`
2. Use fixtures from `tests/conftest.py`
3. Follow pattern in `tests/benchmark/test_cache_perf.py`
