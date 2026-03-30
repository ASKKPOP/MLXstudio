# /engine/tool-parsers — Engine: Tool Calling Parsers

Work with the 13 tool call format parsers for different model families.

## Usage
`/engine/tool-parsers $ARGUMENTS`

## Source Files
```
vmlx_engine/tool_parsers/
  abstract_tool_parser.py    Base class + ToolParserManager
  auto_tool_parser.py        Auto-detection (tries all formats)
  qwen_tool_parser.py        Qwen models [Calling tool:] format
  llama_tool_parser.py       Llama <function=name> format
  mistral_tool_parser.py     Mistral [TOOL_CALLS] format
  deepseek_tool_parser.py    DeepSeek unicode tokens
  hermes_tool_parser.py      Hermes/NousResearch format
  glm47_tool_parser.py       GLM-4.7 format
  minimax_tool_parser.py     MiniMax M2 format
  nemotron_tool_parser.py    NVIDIA Nemotron format
  granite_tool_parser.py     IBM Granite format
  functionary_tool_parser.py MeetKai Functionary format
  xlam_tool_parser.py        Salesforce xLAM format
  kimi_tool_parser.py        Kimi/Moonshot format
  step3p5_tool_parser.py     StepFun Step-3.5 format
```

## Configure Tool Parser
```bash
# Auto-detect from model config (recommended)
vmlx serve <model> --tool-call-parser auto

# Specify parser explicitly
vmlx serve <model> --tool-call-parser qwen
vmlx serve <model> --tool-call-parser llama
vmlx serve <model> --tool-call-parser mistral
```

## Model → Parser Mapping
| Model Family | Parser |
|-------------|--------|
| Qwen2/3, QwQ, MiniMax | `qwen` |
| Llama 3.1/3.2/3.3 | `llama` |
| Mistral, Mixtral | `mistral` |
| DeepSeek | `deepseek` |
| GLM-4.7 | `glm47` |
| Nemotron | `nemotron` |
| IBM Granite | `granite` |
| NousResearch Hermes | `hermes` |
| Salesforce xLAM | `xlam` |
| Kimi/Moonshot | `kimi` |
| StepFun Step-3.5 | `step3p5` |
| MeetKai Functionary | `functionary` |

## Adding a New Tool Parser
1. Create `vmlx_engine/tool_parsers/mymodel_tool_parser.py`
2. Inherit from `AbstractToolParser` in `abstract_tool_parser.py`
3. Implement `extract_tool_calls(text: str) -> list[ToolCall]`
4. Register in `ToolParserManager` in `abstract_tool_parser.py`
5. Add to `model_config_registry.py` for auto-detection
6. Add tests in `tests/test_tool_parsers.py`

## Testing Tool Parsers
```bash
pytest tests/test_tool_parsers.py -v
pytest tests/test_native_tool_format.py -v
```
