# /engine/reasoning — Engine: Reasoning / Thinking Parsers

Work with reasoning model parsers that extract `<think>` blocks from model output.

## Usage
`/engine/reasoning $ARGUMENTS`

## Source Files
```
vmlx_engine/reasoning/
  base.py              Abstract base parser
  qwen3_parser.py      Qwen3, QwQ, MiniMax, StepFun
  deepseek_r1_parser.py DeepSeek R1, Gemma 3, GLM, Phi-4
  mistral_parser.py    Mistral reasoning format
  gptoss_parser.py     GLM Flash, GPT-OSS
  think_parser.py      Generic <think> tag parser
```

## Configure Reasoning Parser
```bash
# Auto-detect from model (recommended)
vmlx serve <model> --reasoning-parser auto

# Specify parser explicitly
vmlx serve <model> --reasoning-parser qwen3
vmlx serve <model> --reasoning-parser deepseek_r1
```

## Enable Thinking in API Request
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "Solve: 23 * 47"}],
    "enable_thinking": true,
    "stream": true
  }'
```

## Model → Parser Mapping
| Models | Parser |
|--------|--------|
| Qwen3, QwQ, MiniMax, StepFun | `qwen3` |
| DeepSeek-R1, Gemma 3, GLM, Phi-4 | `deepseek_r1` |
| Mistral reasoning | `mistral` |
| GLM Flash, GPT-OSS | `openai_gptoss` |
| Any `<think>` tag model | `think` |

## SSE Stream Format
Reasoning content is emitted as separate SSE chunks with `reasoning_content` field:
```json
{"choices": [{"delta": {"reasoning_content": "Let me think..."}}]}
{"choices": [{"delta": {"content": "The answer is 1081."}}]}
```

## Adding a New Reasoning Parser
1. Create `vmlx_engine/reasoning/mymodel_parser.py`
2. Inherit from `base.ReasoningParser`
3. Implement `extract(text: str) -> tuple[str, str]` → (thinking, answer)
4. Register in `model_config_registry.py` under the model's config
5. Test with a real reasoning model prompt
