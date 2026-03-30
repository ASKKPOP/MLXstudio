# /engine/embeddings — Engine: Embeddings & Reranking

Work with text embeddings and document reranking.

## Usage
`/engine/embeddings $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/embedding.py` | Embedding generation (~3.4KB) |
| `vmlx_engine/reranker.py` | Reranking endpoint (~17KB) |
| `vmlx_engine/server.py` | `/v1/embeddings` + `/v1/rerank` endpoints |
| `tests/test_embeddings.py` | Embedding tests |
| `tests/test_reranker_endpoint.py` | Reranker tests |

## Start Embedding Server
```bash
vmlx serve <embedding-model> --port 8000
# Compatible with any mlx-lm embedding model
```

## Embeddings API
```bash
curl http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "input": "The quick brown fox jumps over the lazy dog",
    "dimensions": 1024
  }'
```

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="x")
response = client.embeddings.create(
    model="local",
    input=["First document", "Second document"],
)
for emb in response.data:
    print(emb.embedding[:5])  # First 5 dims
```

## Batch Embeddings
```bash
curl http://localhost:8000/v1/embeddings \
  -d '{
    "model": "local",
    "input": ["doc1", "doc2", "doc3", "doc4"],
    "dimensions": 512
  }'
```

## Reranking API
```bash
vmlx serve <reranker-model> --port 8001

curl http://localhost:8001/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "query": "What is machine learning?",
    "documents": [
      "ML is a subset of AI that learns from data",
      "The weather is sunny today",
      "Neural networks are inspired by the brain"
    ],
    "top_n": 2
  }'
```

## Testing
```bash
pytest tests/test_embeddings.py -v
pytest tests/test_reranker_endpoint.py -v
```

## Notes
- Embeddings use full-batch processing (all tokens at once, no streaming)
- `dimensions` parameter truncates/projects the output vector
- Reranking returns relevance scores for document ranking
