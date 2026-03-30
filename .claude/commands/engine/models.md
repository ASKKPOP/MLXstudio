# /engine/models — Engine: Model Management

List, inspect, download, and register models.

## Usage
`/engine/models $ARGUMENTS`

## Source Files
| File | Role |
|------|------|
| `vmlx_engine/model_registry.py` | Model registry (~5.8KB) |
| `vmlx_engine/model_config_registry.py` | Auto-detect config (~9.3KB) |
| `vmlx_engine/model_configs.py` | 100+ predefined configs (~20KB) |
| `vmlx_engine/commands/info.py` | `vmlx info` command |
| `vmlx_engine/commands/list.py` | `vmlx list` command |
| `vmlx_engine/utils/model_inspector.py` | Model inspection |
| `vmlx_engine/utils/tokenizer.py` | Tokenizer loading/caching |
| `vmlx_engine/utils/chat_templates.py` | Chat format templates |

## Commands
```bash
# List available/downloaded models
vmlx list

# Show model metadata and config
vmlx info mlx-community/Qwen3-8B-4bit

# Download a model
vmlx download mlx-community/Qwen3-8B-4bit

# Model diagnostics
vmlx doctor mlx-community/Qwen3-8B-4bit
```

## Model Config Registry
Auto-detection priority:
1. `config.json` → `model_type` field (e.g., `qwen3`, `llama`, `mistral`)
2. Repository name regex patterns
3. Fallback defaults

```python
# How config lookup works (model_config_registry.py)
registry = ModelConfigRegistry()
config = registry.get_config("mlx-community/Qwen3-8B-4bit")
# Returns: tool_parser, reasoning_parser, cache_type, chat_template, etc.
```

## Supported Model Families (100+)
| Family | Examples |
|--------|---------|
| Qwen 2/3/3.5 | Qwen3-0.6B, Qwen3-8B, QwQ-32B |
| Llama 3/3.1/3.2/3.3/4 | Llama-3.2-3B, Llama-3.3-70B |
| Mistral/Mixtral | Mistral-7B, Mixtral-8x7B |
| Gemma 3/3n | Gemma-3-4B, Gemma-3-27B |
| Phi-4 | Phi-4-mini, Phi-4 |
| DeepSeek | DeepSeek-V3, DeepSeek-R1 |
| Vision | Qwen3.5-VL, LLaVA, InternVL, Pixtral |
| MoE | MiniMax M2.5, Llama 4 Scout |
| SSM Hybrid | Nemotron-H, Jamba |

## Adding a New Model
1. Identify `model_type` from the model's `config.json`
2. Add entry in `vmlx_engine/model_configs.py`
3. Specify: `tool_parser`, `reasoning_parser`, `cache_type`, `chat_template`
4. Register detection pattern in `vmlx_engine/model_config_registry.py`
5. Test: `vmlx info <model> && vmlx serve <model>`

## Model Storage Location
Default: `~/.mlxstudio/models/`
- Text models: `~/.mlxstudio/models/<org>/<name>/`
- Image models: `~/.mlxstudio/models/image/<name>/`
