# /engine/doctor — Engine: System Diagnostics

Run diagnostics to check system health, dependencies, and model compatibility.

## Usage
`/engine/doctor $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/commands/doctor.py` | Diagnostic checks |
| `vmlx_engine/cli.py` | `doctor_command()` entry |

## Commands
```bash
# Run full system diagnostics
vmlx doctor

# Diagnose specific model
vmlx doctor mlx-community/Qwen3-8B-4bit

# Check system info
vmlx info <model>
```

## What Doctor Checks
1. **Python version** — 3.11–3.13 required
2. **MLX installation** — `import mlx`, Metal availability
3. **mlx-lm version** — minimum 0.30.2
4. **mlx-vlm** — optional, for vision models
5. **mflux** — optional, for image generation
6. **mlx-audio** — optional, for TTS/STT
7. **jang** — optional, for JANG quantization
8. **GPU memory** — available unified memory
9. **Model config** — valid config.json, tokenizer
10. **Tokenizer load** — fast tokenizer availability

## Health Endpoint
```bash
curl http://localhost:8000/health
# Returns: {"status": "ok", "model": "...", "queue_size": 0, "vram_used": "..."}
```

## Common Issues & Fixes
| Issue | Fix |
|-------|-----|
| `mlx not found` | `pip install mlx` or Apple Silicon required |
| `mlx-lm too old` | `pip install --upgrade mlx-lm` |
| Model fails to load | Check `vmlx info <model>` for config errors |
| OOM on load | Try 4-bit quantized version, or reduce `--max-model-len` |
| Tokenizer error | Ensure `tokenizer.json` or `tokenizer_config.json` present |
