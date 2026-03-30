# /engine/audio — Engine: Audio (TTS & STT)

Work with Text-to-Speech and Speech-to-Text via mlx-audio.

## Usage
`/engine/audio $ARGUMENTS`

## Source Files
```
vmlx_engine/audio/
  tts.py         Text-to-Speech (Kokoro, Chatterbox, VibeVoice, VoxCPM)
  stt.py         Speech-to-Text (Whisper, Parakeet)
  processor.py   Audio format handling and device management
  __init__.py    Subsystem init
```

## Install
```bash
pip install vmlx[audio]
# or
pip install mlx-audio
```

## Start Audio Servers
```bash
# TTS (Kokoro)
vmlx serve kokoro --port 8002

# STT (Whisper)
vmlx serve whisper --port 8003
```

## TTS API
```bash
curl http://localhost:8002/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kokoro",
    "input": "Hello, welcome to vMLX!",
    "voice": "af_heart"
  }' --output speech.wav
```

### Available TTS Voices (Kokoro)
- `af_heart` (default) — US English female
- `am_adam` — US English male
- `bf_emma` — British English female
- `bm_george` — British English male

### TTS Models
| Model | Description |
|-------|-------------|
| `kokoro` | Fast, high-quality TTS (default) |
| `chatterbox` | Expressive TTS |
| `vibevoice` | VibeVoice model |
| `voxcpm` | VoxCPM model |

## STT API
```bash
curl http://localhost:8003/v1/audio/transcriptions \
  -F file=@audio.wav \
  -F model=whisper

# Translation (to English)
curl http://localhost:8003/v1/audio/translations \
  -F file=@audio.wav \
  -F model=whisper
```

### STT Models
| Model | Description |
|-------|-------------|
| `whisper` | Multilingual (99+ languages) |
| `parakeet` | English-only, faster |

## Testing Audio
```bash
pytest tests/test_audio.py -v
```

## Adding a New TTS Model
1. Add model handler in `vmlx_engine/audio/tts.py`
2. Register model name in `vmlx_engine/model_configs.py`
3. Test with `pytest tests/test_audio.py -v`
