# /engine/convert — Engine: Convert & Quantize Models

Convert HuggingFace models to MLX or JANG quantized format.

## Usage
`/engine/convert $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/commands/convert.py` | Conversion pipeline |
| `vmlx_engine/utils/jang_loader.py` | JANG format loading |
| `vmlx_engine/model_configs.py` | 100+ model configs |
| `vmlx_engine/utils/weight_index.py` | Weight file indexing |

## Commands

### Standard MLX quantization
```bash
vmlx convert <model> --bits 4             # 4-bit uniform
vmlx convert <model> --bits 8             # 8-bit uniform
vmlx convert <model> --bits 4 --group-size 64
vmlx convert <model> --output ./my-model-4bit
```

### JANG adaptive mixed-precision
```bash
pip install vmlx[jang]

vmlx convert <model> --jang-profile JANG_3M      # Recommended
vmlx convert <model> --jang-profile JANG_2L      # 2-bit quality
vmlx convert <model> --jang-profile JANG_4M      # Standard
vmlx convert <model> --jang-profile JANG_6M      # Near lossless

# With activation-aware calibration (better quality at low bits)
vmlx convert <model> --jang-profile JANG_2L --calibration-method activations
```

### GGUF to MLX conversion
```bash
vmlx convert <gguf-model> --output ./mlx-model
```

## JANG Profile Reference
| Profile | Attention | Embeddings | MLP | ~Avg Bits |
|---------|-----------|------------|-----|-----------|
| JANG_2M | 8-bit | 4-bit | 2-bit | 2.5 |
| JANG_2L | 8-bit | 6-bit | 2-bit | 2.7 |
| JANG_3M | 8-bit | 3-bit | 3-bit | 3.2 ✓ |
| JANG_4M | 8-bit | 4-bit | 4-bit | 4.2 |
| JANG_6M | 8-bit | 6-bit | 6-bit | 6.2 |

## Conversion Options
```
--bits             Uniform quantization bits (2/3/4/6/8)
--group-size       Quantization group size (default: 64)
--output           Output directory path
--jang-profile     JANG mixed-precision profile name
--calibration-method  none|activations (activation-aware calibration)
```

## Pre-quantized Models
Available at [JANGQ-AI on HuggingFace](https://huggingface.co/JANGQ-AI) — skip conversion for tested models.

## Post-Conversion Smoke Test
The convert command auto-runs a smoke test with a short prompt.
Run manually: `vmlx serve ./output-dir && curl localhost:8000/health`
