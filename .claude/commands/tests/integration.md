# /tests/integration — Tests: Integration Tests

Run full end-to-end server endpoint tests.

## Usage
`/tests/integration $ARGUMENTS`

## Commands
```bash
# All integration tests
pytest tests/integration/ -v

# Specific endpoint tests
pytest tests/integration/test_server_endpoints.py -v

# With a running server (for live testing)
VMLX_TEST_PORT=8099 pytest tests/integration/ -v
```

## Test Files
```
tests/integration/
  test_server_endpoints.py    Full HTTP endpoint tests
  conftest.py                 Integration-specific fixtures
```

## What Integration Tests Cover
- `POST /v1/chat/completions` — streaming and non-streaming
- `POST /v1/messages` (Anthropic API)
- `POST /v1/completions`
- `POST /v1/embeddings`
- `POST /v1/rerank`
- `GET /v1/models`
- `GET /health`
- `GET /v1/cache/stats`
- `POST /v1/audio/speech`
- `POST /v1/audio/transcriptions`
- `POST /v1/images/generations`
- Tool calling round-trip
- Streaming SSE format validation

## Integration Test Pattern
```python
import pytest
import httpx
import asyncio

@pytest.fixture(scope="module")
async def running_server(small_model):
    # Starts a real FastAPI server on a test port
    server = await start_test_server(small_model, port=8099)
    yield "http://localhost:8099"
    await server.stop()

async def test_chat_completions(running_server):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{running_server}/v1/chat/completions",
            json={
                "model": "local",
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 5,
            }
        )
    assert response.status_code == 200
    data = response.json()
    assert "choices" in data
    assert data["choices"][0]["message"]["role"] == "assistant"
```

## Live Testing Against Real Server
```bash
# Start server manually
vmlx serve mlx-community/Qwen3-0.6B-4bit --port 8099

# Run integration tests against it
VMLX_TEST_URL=http://localhost:8099 pytest tests/integration/ -v
```
