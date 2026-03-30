# /engine/image — Engine: Image Generation & Editing

Work with image generation and editing via mflux (Flux models).

## Usage
`/engine/image $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/image_gen.py` | Image generation engine (~21KB) |
| `vmlx_engine/server.py` | `/v1/images/generations` + `/v1/images/edits` endpoints |

## Install
```bash
pip install vmlx[image]
```

## Start Image Servers
```bash
vmlx serve schnell --port 8001          # Fast generation (4 steps)
vmlx serve dev --port 8001              # High quality (20 steps)
vmlx serve z-image-turbo --port 8001    # Z-Image Turbo
vmlx serve qwen-image-edit --port 8001  # Instruction editing
```

## Generation API
```bash
curl http://localhost:8001/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "schnell",
    "prompt": "A futuristic city at night, neon lights, rain",
    "size": "1024x1024",
    "n": 1,
    "steps": 4,
    "guidance_scale": 0.0
  }'
```

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8001/v1", api_key="x")
response = client.images.generate(
    model="schnell",
    prompt="A mountain lake at sunrise",
    size="1024x1024",
    n=1,
)
print(response.data[0].b64_json)
```

## Editing API
```bash
curl http://localhost:8001/v1/images/edits \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-image-edit",
    "prompt": "Change the sky to a stormy purple",
    "image": "<base64-encoded-image>",
    "size": "1024x1024",
    "strength": 0.8
  }'
```

## Supported Models
| Model | Steps | Type | Memory |
|-------|-------|------|--------|
| `schnell` | 4 | Generation | ~6–24 GB |
| `dev` | 20 | Generation (HQ) | ~6–24 GB |
| `z-image-turbo` | 4 | Generation | ~6–24 GB |
| `qwen-image-edit` | 28 | Instruction editing | ~54 GB |

## Quantization
```bash
vmlx serve schnell --image-quantize 4   # 4-bit (saves memory)
vmlx serve schnell --image-quantize 8   # 8-bit
vmlx serve schnell                       # Full precision
```

## Testing Image Gen
```bash
pytest tests/test_image_gen_engine.py -v
```
