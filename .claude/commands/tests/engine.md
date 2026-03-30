# /tests/engine — Tests: Engine Tests

Run and work with the inference engine test suite.

## Usage
`/tests/engine $ARGUMENTS`

## Commands
```bash
# All engine tests
pytest tests/test_llm.py tests/test_mllm.py tests/test_simple_engine.py \
       tests/test_continuous_batching.py tests/test_batching.py -v

# LLM inference only
pytest tests/test_llm.py -v

# VLM (vision) inference
pytest tests/test_mllm.py -v

# SimpleEngine
pytest tests/test_simple_engine.py -v

# Continuous batching
pytest tests/test_continuous_batching.py tests/test_batching.py -v

# Speculative decoding
pytest tests/test_speculative.py -v

# Deterministic output
pytest tests/test_batching_deterministic.py -v
```

## Test Source Files
| Test File | Tests | Source Under Test |
|-----------|-------|-------------------|
| `test_llm.py` | LLM generation, sampling | `engine/simple.py`, `engine/batched.py` |
| `test_mllm.py` | VLM image+text | `mllm_scheduler.py`, `mllm_batch_generator.py` |
| `test_simple_engine.py` | SimpleEngine API | `engine/simple.py` |
| `test_continuous_batching.py` | Scheduler logic | `scheduler.py` |
| `test_batching.py` | Batch request handling | `scheduler.py`, `engine_core.py` |
| `test_batching_deterministic.py` | Output reproducibility | `scheduler.py` |
| `test_speculative.py` | Draft model decoding | `speculative.py` |
| `test_request.py` | Request dataclass | `request.py` |

## Writing Engine Tests
```python
import pytest
from vmlx_engine.engine.simple import SimpleEngine

@pytest.mark.asyncio
async def test_my_feature(small_model):
    engine = SimpleEngine(model_path=small_model)
    await engine.load()

    output = await engine.generate(
        prompt="Hello",
        max_tokens=10,
        temperature=0.0,  # deterministic
    )
    assert output.text is not None
    assert len(output.tokens) <= 10
```

## Key Fixtures (conftest.py)
```python
@pytest.fixture(scope="session")
def small_model(tmp_path_factory):
    # Returns path to a small test model
    # Downloads once, reuses across tests

@pytest.fixture
def simple_engine(small_model):
    engine = SimpleEngine(model_path=small_model)
    yield engine

@pytest.fixture
def batched_engine(small_model):
    engine = BatchedEngine(model_path=small_model)
    yield engine
```
