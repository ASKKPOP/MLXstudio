# vMLX Comprehensive Audit Checklist

Generated 2026-03-23. Covers every feature, subsystem, and interaction point.

---

## 1. CACHING

### 1.1 Paged Cache (`paged_cache.py`)

#### Verify (does it work?)
- [ ] 1.1.1 Block allocation returns valid block IDs for new sequences
- [ ] 1.1.2 Block deallocation frees blocks back to pool correctly
- [ ] 1.1.3 Hash computation is deterministic for same token sequences
- [ ] 1.1.4 COW fork creates new physical block on write, shares on read
- [ ] 1.1.5 Eviction triggers when free block count falls below threshold
- [ ] 1.1.6 Eviction selects LRU blocks, not actively referenced ones
- [ ] 1.1.7 Block table grows correctly when sequence extends past allocated blocks

#### Audit (is the code correct?)
- [ ] 1.1.8 No off-by-one in block boundary calculations (token_idx / block_size)
- [ ] 1.1.9 Reference counting on shared blocks: increment on fork, decrement on free
- [ ] 1.1.10 Thread safety: concurrent block alloc/free from scheduler + eviction
- [ ] 1.1.11 Hash collision handling: verify blocks actually match after hash hit
- [ ] 1.1.12 Memory leak: blocks allocated but never freed on request abort

#### Fix (known bugs)
- [ ] 1.1.13 CacheList tag not handled in block_disk_store `_serialize_block` (known WARN #3)

#### Test (edge cases)
- [ ] 1.1.14 All blocks allocated (pool exhausted) -- graceful error, not crash
- [ ] 1.1.15 Single-token sequence (less than one block)
- [ ] 1.1.16 Sequence exactly fills block boundary (no partial last block)
- [ ] 1.1.17 COW fork then original freed -- forked block survives
- [ ] 1.1.18 Rapid alloc/free cycle (stress test for pool fragmentation)

### 1.2 Prefix Cache (`prefix_cache.py`)

#### Verify
- [ ] 1.2.1 Store: prefix tokens are keyed and stored correctly
- [ ] 1.2.2 Fetch: exact prefix match returns cached KV states
- [ ] 1.2.3 Fetch: partial prefix match returns longest matching prefix
- [ ] 1.2.4 Reconstruct: cached KV states are correctly sliced and applied
- [ ] 1.2.5 Partial blocks: prefix shorter than block size still works
- [ ] 1.2.6 gen_prompt_len stripping: thinking model generation prompt tokens excluded from cache key

#### Audit
- [ ] 1.2.7 Cache key includes all relevant state (tokens, model, quantization level)
- [ ] 1.2.8 Cache invalidation: stale entries removed when model changes
- [ ] 1.2.9 Memory accounting: prefix cache size counted in Metal memory budget
- [ ] 1.2.10 gen_prompt_len computation covers ALL thinking models: Qwen3, DeepSeek R1, Mistral 4, MiniMax, Kimi K2, GLM-Z1

#### Test
- [ ] 1.2.11 Multi-turn conversation: second turn hits prefix cache for first turn
- [ ] 1.2.12 Multi-turn with reasoning ON then OFF: cache key diverges correctly
- [ ] 1.2.13 Multi-turn with reasoning OFF then ON: no stale reasoning cache
- [ ] 1.2.14 Two concurrent requests with overlapping prefixes
- [ ] 1.2.15 Prefix cache after model sleep/wake cycle
- [ ] 1.2.16 Prefix cache with KV quantization enabled
- [ ] 1.2.17 Prefix that is exact repeat of previous full response (no new tokens)

### 1.3 Block Disk Store (`block_disk_store.py`)

#### Verify
- [ ] 1.3.1 Serialize: KV blocks written to disk in correct format
- [ ] 1.3.2 Deserialize: KV blocks read from disk match originals
- [ ] 1.3.3 L2 tier: blocks evicted from GPU → disk, restored disk → GPU
- [ ] 1.3.4 LRU eviction: least-recently-used disk blocks removed when disk budget exceeded

#### Audit
- [ ] 1.3.5 Metal safety: no lazy MLX ops in serialize path (must be numpy)
- [ ] 1.3.6 File handle lifecycle: opened/closed correctly, no leaked descriptors
- [ ] 1.3.7 Disk corruption handling: checksum or length validation on deserialize
- [ ] 1.3.8 CacheList tag handling (known gap -- MoE models skip disk L2)
- [ ] 1.3.9 Numpy path for CacheList layers: explicit skip or fallback

#### Test
- [ ] 1.3.10 Serialize then immediately deserialize: roundtrip integrity
- [ ] 1.3.11 Large block (max KV head dim, max seq len per block)
- [ ] 1.3.12 Disk full condition: graceful error
- [ ] 1.3.13 Concurrent serialize + deserialize from scheduler threads
- [ ] 1.3.14 Process crash during serialize: partial file cleanup

### 1.4 Prompt Disk Cache (`disk_cache.py`)

#### Verify
- [ ] 1.4.1 Store: full prompt cache saved to disk with correct key
- [ ] 1.4.2 Load: prompt cache restored from disk matches original
- [ ] 1.4.3 Metal safety: no stale GPU pointers after disk load

#### Audit
- [ ] 1.4.4 Cache key includes model path + quantization config
- [ ] 1.4.5 No MLX lazy eval ops in the serialize path
- [ ] 1.4.6 Eviction policy: oldest or LRU when disk budget exceeded

#### Test
- [ ] 1.4.7 Store/load across model sleep/wake cycle
- [ ] 1.4.8 Load cache from different model (should fail gracefully)
- [ ] 1.4.9 Corrupted cache file on disk: error handling

### 1.5 KV Cache Quantization

#### Verify
- [ ] 1.5.1 q4 quantization: KV states quantized and dequantized correctly
- [ ] 1.5.2 q8 quantization: same as above with 8-bit
- [ ] 1.5.3 MLA guard: KV quantization DISABLED for MLA models (Mistral 4, DeepSeek V3)
- [ ] 1.5.4 QuantizedKVCache tuple handling: cache entries as (k, v) tuples work

#### Audit
- [ ] 1.5.5 QuantizedKVCache list vs tuple: paged cache fix (from session 2026-03-21c)
- [ ] 1.5.6 Quality degradation warning for q4 on long reasoning contexts (known WARN #5)
- [ ] 1.5.7 Quantized cache + prefix cache interaction: prefix stored quantized or fp16?

#### Test
- [ ] 1.5.8 Enable KV quant mid-session: does it apply to new tokens only?
- [ ] 1.5.9 KV quant with hybrid SSM model (Nemotron-H): only attention layers quantized
- [ ] 1.5.10 KV quant after wake from deep sleep

### 1.6 Cache + Model Type Matrix

#### Verify
- [ ] 1.6.1 Standard KV (Llama, Gemma): paged + prefix + disk all work
- [ ] 1.6.2 MLA (Mistral 4, DeepSeek V3): paged cache with head inflation, no KV quant
- [ ] 1.6.3 Hybrid SSM (Nemotron-H): MambaCache layers + attention layers coexist
- [ ] 1.6.4 MoE CacheList (DeepSeek V3): CacheList wrapping per-expert caches
- [ ] 1.6.5 RotatingKV: sliding window attention cache (if applicable)
- [ ] 1.6.6 QuantizedKV: all standard models work with q4/q8

#### Audit
- [ ] 1.6.7 `_ensure_batch_cache` checks ArraysCache not MambaCache directly (known WARN #3)
- [ ] 1.6.8 MoE CacheList + paged cache interaction: does paging work per-expert?
- [ ] 1.6.9 Hybrid SSM boundary snapshots: MambaCache state saved/restored at block boundaries

#### Test
- [ ] 1.6.10 Each model type: start session, chat 3 turns, check cache stats
- [ ] 1.6.11 Model switch (standard → MLA): cache completely cleared
- [ ] 1.6.12 Batched inference with mixed cache types (if supported)

### 1.7 Cache After Sleep/Wake

#### Verify
- [ ] 1.7.1 Soft sleep: cache cleared, Metal memory limit reduced
- [ ] 1.7.2 Wake from soft sleep: cache limit restored correctly
- [ ] 1.7.3 Deep sleep: model unloaded, all cache freed
- [ ] 1.7.4 Wake from deep sleep: fresh cache initialized

#### Audit
- [ ] 1.7.5 Stale cache references: no dangling pointers after sleep
- [ ] 1.7.6 Cache stats reset on sleep (not showing stale hit rates)
- [ ] 1.7.7 Prefix cache invalidated on sleep (not returning pre-sleep entries)

#### Test
- [ ] 1.7.8 Chat → sleep → wake → chat: no crash, correct generation
- [ ] 1.7.9 Chat → sleep → model switch → wake: no stale cache
- [ ] 1.7.10 Concurrent request arrives during sleep transition

### 1.8 Memory Pressure

#### Verify
- [ ] 1.8.1 Metal memory monitoring reports accurate usage
- [ ] 1.8.2 Eviction triggers at correct threshold (not too early, not too late)
- [ ] 1.8.3 After eviction, memory usage drops measurably

#### Audit
- [ ] 1.8.4 Memory pressure handling does not evict currently-in-use blocks
- [ ] 1.8.5 `memory_enforcer.ts` (Electron) and engine-side pressure: no double-eviction race

#### Test
- [ ] 1.8.6 Load large model, chat until near memory limit, verify eviction
- [ ] 1.8.7 Two sessions sharing memory: one evicts, other unaffected
- [ ] 1.8.8 OOM recovery: does the system degrade gracefully or crash?

---

## 2. MODEL LOADING

### 2.1 JANG v2 Text Loader (`utils/jang_loader.py`)

#### Verify
- [ ] 2.1.1 Weight loading: safetensors read, keys mapped to MLX module names
- [ ] 2.1.2 Quantization: QuantizedLinear repacking stays quantized in GPU memory
- [ ] 2.1.3 Gate dequant: MoE gate weights dequantized to bfloat16 (8-bit high-to-low)
- [ ] 2.1.4 bfloat16 cast: MLA models get bfloat16 (correct by design)
- [ ] 2.1.5 `_fix_quantized_bits`: handles QuantizedMultiLinear (embed_q, unembed_out)
- [ ] 2.1.6 Nemotron Cascade: fc1/fc2 rename + gate dequant works

#### Audit
- [ ] 2.1.7 Weight key mismatch: error message identifies which key is missing
- [ ] 2.1.8 No silent weight drops: all safetensor keys accounted for or explicitly skipped
- [ ] 2.1.9 Memory usage during load: no double-copy (file → CPU → GPU should be streaming)

#### Test
- [ ] 2.1.10 Load JANG 2-bit, 4-bit, 8-bit variants of same model
- [ ] 2.1.11 Load JANG model with missing weight file: error not crash
- [ ] 2.1.12 Load JANG model after previous model (verify full cleanup)

### 2.2 JANG v2 VLM Loader (`models/mllm.py`)

#### Verify
- [ ] 2.2.1 kv_b_proj split: split into correct dimensions for MLA
- [ ] 2.2.2 embed_q / unembed_out: loaded as QuantizedMultiLinear
- [ ] 2.2.3 Vision weights: loaded separately, not quantized
- [ ] 2.2.4 Gate dequant for VLM MoE layers
- [ ] 2.2.5 `jang_config.json` `has_vision: true` detection

#### Audit
- [ ] 2.2.6 Vision encoder precision: fp16/fp32, NOT quantized (especially not 2-bit)
- [ ] 2.2.7 JANG VL MoE not working yet (known issue -- sanitizer conflict)
- [ ] 2.2.8 Fallthrough from jang_config to config.json for `is_mllm_model()`

#### Test
- [ ] 2.2.9 Load JANG VLM, send image, verify vision encoder processes it
- [ ] 2.2.10 Load JANG VLM with `has_vision: false` but vision weights present (fallthrough)
- [ ] 2.2.11 Mistral 4 JANG VLM: image_token_index=10 [IMG] end-to-end

### 2.3 Standard MLX Loader

#### Verify
- [ ] 2.3.1 `mlx_lm.load()` for text models: correct tokenizer + model
- [ ] 2.3.2 `mlx_vlm.load()` for VLM: correct vision encoder + text model
- [ ] 2.3.3 Model loads from HuggingFace cache path
- [ ] 2.3.4 Model loads from local directory

#### Test
- [ ] 2.3.5 Load model with custom chat template
- [ ] 2.3.6 Load model with missing tokenizer.json (fallback to tokenizer.model)

### 2.4 Model Config Registry (`model_config_registry.py`, `model_configs.py`)

#### Verify
- [ ] 2.4.1 Lookup by model_type returns correct config
- [ ] 2.4.2 text_config.model_type disambiguation (VLM wrappers like pixtral → mistral)
- [ ] 2.4.3 Priority: text_config.model_type > config.json model_type > name regex fallback

#### Audit
- [ ] 2.4.4 All supported model families have entries in registry
- [ ] 2.4.5 Registry entries match actual model architectures (stop tokens, max_position, etc.)
- [ ] 2.4.6 No stale entries for removed/renamed model types

#### Test
- [ ] 2.4.7 Unknown model_type: graceful fallback to generic config
- [ ] 2.4.8 Model with text_config AND model_type: text_config wins

### 2.5 is_mllm_model Detection

#### Verify
- [ ] 2.5.1 JANG path: checks jang_config.has_vision THEN falls through to config.json
- [ ] 2.5.2 Standard path: checks config.json vision_config
- [ ] 2.5.3 No early return on jang_config (defense in depth)

#### Test
- [ ] 2.5.4 Text-only model: returns False
- [ ] 2.5.5 VLM model: returns True
- [ ] 2.5.6 JANG text model with `has_vision: false`: returns False
- [ ] 2.5.7 JANG VLM with `has_vision: true`: returns True
- [ ] 2.5.8 JANG VLM with `has_vision: false` but config.json has vision_config: returns True (fallthrough)

### 2.6 Bundled vs System Python

#### Audit
- [ ] 2.6.1 Electron app launches with `-s` flag (bundled, not system site-packages)
- [ ] 2.6.2 Bundled mlx_lm/mlx_vlm includes all patches (Mistral4VLMBackbone, etc.)
- [ ] 2.6.3 `vmlx_engine/` in bundled matches source (CRITICAL sync step)
- [ ] 2.6.4 No stale .pyc files in bundled that override .py changes

---

## 3. INFERENCE

### 3.1 LLM Scheduler (`scheduler.py`)

#### Verify
- [ ] 3.1.1 add_request: request queued, assigned ID, state = WAITING
- [ ] 3.1.2 Prefill: prompt tokens processed, KV cache populated
- [ ] 3.1.3 Decode: autoregressive generation produces tokens
- [ ] 3.1.4 Cleanup: finished/aborted requests have cache freed
- [ ] 3.1.5 GQA head normalization in `_detect_n_kv_heads()`

#### Audit
- [ ] 3.1.6 Request state machine: WAITING → RUNNING → FINISHED/ABORTED (no invalid transitions)
- [ ] 3.1.7 Abort during prefill: stops cleanly, frees partial cache
- [ ] 3.1.8 MLA guard in scheduler (head inflation for MLA models)
- [ ] 3.1.9 Stale `_n_kv_heads` on model switch (known WARN #8, fixed with clear() reset)

#### Test
- [ ] 3.1.10 Single request: start to finish
- [ ] 3.1.11 Concurrent requests: both get correct independent outputs
- [ ] 3.1.12 Abort mid-generation: partial response returned, no resource leak
- [ ] 3.1.13 Max tokens reached: generation stops, finish_reason = "length"
- [ ] 3.1.14 Stop token hit: generation stops, finish_reason = "stop"

### 3.2 MLLM Scheduler (`mllm_scheduler.py`)

#### Verify
- [ ] 3.2.1 Vision encoding: images processed through vision encoder
- [ ] 3.2.2 Batch generator: vision tokens + text tokens merged correctly
- [ ] 3.2.3 Cache extraction: KV states extracted for VLM properly

#### Audit
- [ ] 3.2.4 `_extract_cache_states` missing GQA head normalization (known bug #2 from todo)
- [ ] 3.2.5 MLA MLLM batch with head inflation (known WARN #10, single-request OK)
- [ ] 3.2.6 Vision embedding cache: reuse across multi-turn with same image

#### Test
- [ ] 3.2.7 Single image input: correct visual understanding
- [ ] 3.2.8 Multiple images in one request
- [ ] 3.2.9 Text-only request to VLM model (no image)
- [ ] 3.2.10 Large image (high resolution): processing doesn't crash
- [ ] 3.2.11 Abort during vision encoding phase

### 3.3 Continuous Batching (`engine/batched.py`)

#### Verify
- [ ] 3.3.1 Batch merge: new requests added to running batch
- [ ] 3.3.2 Batch filter: finished requests removed from batch
- [ ] 3.3.3 Batch extend: running batch grows with new prefill
- [ ] 3.3.4 Batch extract: individual request outputs separated correctly

#### Audit
- [ ] 3.3.5 Batch size limits: not exceeding GPU memory per batch
- [ ] 3.3.6 gen_prompt_len computation for batched requests
- [ ] 3.3.7 Chat template application: consistent across batch

#### Test
- [ ] 3.3.8 2 simultaneous requests, different lengths, different stop tokens
- [ ] 3.3.9 Add request while batch is mid-decode
- [ ] 3.3.10 All requests in batch finish same step
- [ ] 3.3.11 Continuous batching after sleep/wake

### 3.4 SimpleEngine (`engine/simple.py`, `simple.py`)

#### Verify
- [ ] 3.4.1 `chat()`: single-turn chat completion
- [ ] 3.4.2 `stream_chat()`: streaming token output
- [ ] 3.4.3 `generate()`: raw text generation

#### Audit
- [ ] 3.4.4 Prefill not interruptible (known issue -- stop button unresponsive during long prefills)
- [ ] 3.4.5 Memory cleanup after generate completes

#### Test
- [ ] 3.4.6 Very long prompt (near context window limit)
- [ ] 3.4.7 Empty prompt: handled gracefully
- [ ] 3.4.8 Stream then abort: partial tokens delivered, clean shutdown

### 3.5 Stop Tokens

#### Verify
- [ ] 3.5.1 Model-specific stop tokens applied (from model config registry)
- [ ] 3.5.2 Chat template stop tokens applied
- [ ] 3.5.3 User-provided stop tokens (via API `stop` field) applied
- [ ] 3.5.4 Multiple stop tokens: first match wins

#### Audit
- [ ] 3.5.5 Stop token detection in streaming: partial multi-byte token handling
- [ ] 3.5.6 Stop token not included in output (or included if echo=true)

#### Test
- [ ] 3.5.7 Custom stop sequence (e.g., "```") mid-word
- [ ] 3.5.8 Stop token at exactly max_tokens boundary
- [ ] 3.5.9 No stop tokens configured: generation runs to max_tokens

### 3.6 Sampling

#### Verify
- [ ] 3.6.1 temperature=0: deterministic (argmax)
- [ ] 3.6.2 temperature>0: random sampling with correct distribution
- [ ] 3.6.3 top_p: nucleus sampling filters correctly
- [ ] 3.6.4 top_k: top-k sampling filters correctly
- [ ] 3.6.5 min_p: minimum probability filtering
- [ ] 3.6.6 repetition_penalty: reduces probability of repeated tokens

#### Test
- [ ] 3.6.7 temperature=0 with seed: reproducible output
- [ ] 3.6.8 top_p=0.0: should be argmax (or error?)
- [ ] 3.6.9 top_k=1: should be argmax
- [ ] 3.6.10 All params combined: temperature + top_p + top_k + repetition_penalty

### 3.7 SSD Streaming (`utils/ssd_generate.py`)

#### Verify
- [ ] 3.7.1 Weight recycling: layers streamed from SSD, not all held in memory
- [ ] 3.7.2 Generation produces correct output despite layer cycling
- [ ] 3.7.3 Memory usage stays bounded (not growing with generation length)

#### Audit
- [ ] 3.7.4 Disk I/O errors during streaming: graceful handling
- [ ] 3.7.5 Weight index (`utils/weight_index.py`) correctly maps layer → file offset

#### Test
- [ ] 3.7.6 Model larger than GPU memory: SSD streaming enables generation
- [ ] 3.7.7 SSD streaming + prefix cache interaction
- [ ] 3.7.8 Abort during SSD streaming decode

### 3.8 Speculative Decoding (`speculative.py`)

#### Verify
- [ ] 3.8.1 Draft model generates candidate tokens
- [ ] 3.8.2 Target model verifies candidates in single forward pass
- [ ] 3.8.3 Accepted tokens emitted, rejected tokens regenerated

#### Test
- [ ] 3.8.4 All candidates accepted: max speedup
- [ ] 3.8.5 All candidates rejected: no worse than normal decode
- [ ] 3.8.6 Draft model OOM: fallback to normal decode

---

## 4. REASONING

### 4.1 Reasoning Parsers

#### Verify
- [ ] 4.1.1 Qwen3 parser (`qwen3_parser.py`): `<think>...</think>` extraction
- [ ] 4.1.2 DeepSeek R1 parser (`deepseek_r1_parser.py`): `<think>...</think>` extraction
- [ ] 4.1.3 Mistral parser (`mistral_parser.py`): `[THINK]...[/THINK]` extraction
- [ ] 4.1.4 GPT-OSS parser (`gptoss_parser.py`): reasoning block extraction
- [ ] 4.1.5 Think parser (`think_parser.py`): generic `<think>` tag parsing
- [ ] 4.1.6 Base parser (`base.py`): abstract interface, factory method

#### Audit
- [ ] 4.1.7 Partial tag handling across chunk boundaries (known WARN #6: rare char leak)
- [ ] 4.1.8 State machine in each parser: all states reachable, no dead states
- [ ] 4.1.9 GPT-OSS emitted_reasoning shrink edge case (known WARN #7)

#### Test
- [ ] 4.1.10 Reasoning starts immediately (first token is `<think>`)
- [ ] 4.1.11 Reasoning in middle of response (after some text)
- [ ] 4.1.12 No reasoning at all (model doesn't produce think tags)
- [ ] 4.1.13 Nested or malformed tags: `<think><think>...</think>`
- [ ] 4.1.14 Very long reasoning (1000+ tokens before `</think>`)
- [ ] 4.1.15 Empty reasoning: `<think></think>` immediately

### 4.2 Streaming Extraction

#### Verify
- [ ] 4.2.1 Partial tags buffered, not emitted prematurely
- [ ] 4.2.2 Complete tags extracted and routed to reasoning_content
- [ ] 4.2.3 Concurrent requests: each gets own parser state

#### Audit
- [ ] 4.2.4 Server-side vs client-side parsing: double extraction guard
- [ ] 4.2.5 Reasoning ON but no think tags: fallback re-emit delay (known WARN #4)

#### Test
- [ ] 4.2.6 Chunk boundary splits `<thi` | `nk>`: correctly assembled
- [ ] 4.2.7 Chunk boundary splits `</thi` | `nk>`: correctly assembled
- [ ] 4.2.8 Single-character chunks: each char of `<think>` arrives separately

### 4.3 enable_thinking / reasoning_effort

#### Verify
- [ ] 4.3.1 enable_thinking=true: thinking tags included in generation
- [ ] 4.3.2 enable_thinking=false: thinking suppressed
- [ ] 4.3.3 Mistral 4: enable_thinking auto-maps to reasoning_effort
- [ ] 4.3.4 reasoning_effort="none": no thinking (Mistral 4)
- [ ] 4.3.5 reasoning_effort="high": full thinking (Mistral 4)

#### Audit
- [ ] 4.3.6 think_in_template detection: "always-thinks" vs "completes-thinking" (S5 seed)
- [ ] 4.3.7 suppress_reasoning: reasoning consumed but hidden from response
- [ ] 4.3.8 think_in_template=False doesn't break multi-turn with reasoning

#### Test
- [ ] 4.3.9 Toggle reasoning ON → OFF → ON across multi-turn: each turn correct
- [ ] 4.3.10 Reasoning ON with model that doesn't support thinking: graceful ignore
- [ ] 4.3.11 `[THINK]` → `<think>` normalization in chat.ts (Electron side)

---

## 5. TOOL CALLING

### 5.1 Tool Parsers (14 parsers in `tool_parsers/`)

#### Verify
- [ ] 5.1.1 Mistral: `[TOOL_CALLS]` marker detection + JSON extraction
- [ ] 5.1.2 Llama: `<|python_tag|>` or JSON block extraction
- [ ] 5.1.3 Hermes: `<tool_call>...</tool_call>` XML extraction
- [ ] 5.1.4 DeepSeek: function call JSON extraction
- [ ] 5.1.5 Qwen: function call extraction
- [ ] 5.1.6 Functionary: v3 format parsing
- [ ] 5.1.7 Granite: IBM granite tool format
- [ ] 5.1.8 GLM-47: ChatGLM tool format
- [ ] 5.1.9 Kimi: Kimi K2 tool format
- [ ] 5.1.10 MiniMax: MiniMax tool format
- [ ] 5.1.11 Nemotron: Nemotron tool format
- [ ] 5.1.12 Step 3.5: Step tool format
- [ ] 5.1.13 xLAM: Salesforce xLAM format
- [ ] 5.1.14 Auto: automatic parser selection based on model config

#### Audit
- [ ] 5.1.15 Abstract base class (`abstract_tool_parser.py`): all concrete parsers implement required methods
- [ ] 5.1.16 Streaming tool call detection: marker buffering doesn't drop text

#### Test
- [ ] 5.1.17 Single tool call
- [ ] 5.1.18 Multiple tool calls in one response (parallel tool use)
- [ ] 5.1.19 Tool call with no arguments: `{}`
- [ ] 5.1.20 Tool call with nested JSON arguments
- [ ] 5.1.21 Malformed JSON in tool call: error handling
- [ ] 5.1.22 Tool call + text before/after: text preserved

### 5.2 Tool Call + Reasoning Interaction

#### Verify
- [ ] 5.2.1 Model thinks, then makes tool call: both extracted correctly
- [ ] 5.2.2 Tool result fed back, model reasons about result

#### Test
- [ ] 5.2.3 Reasoning inside tool call JSON (malformed): handled
- [ ] 5.2.4 Stop during tool call mid-generation

### 5.3 tool_choice

#### Verify
- [ ] 5.3.1 `auto`: model decides whether to call tools
- [ ] 5.3.2 `none`: tools disabled, model generates text only
- [ ] 5.3.3 `required`: model must make a tool call
- [ ] 5.3.4 `{"type": "function", "function": {"name": "X"}}`: forced specific tool

#### Test
- [ ] 5.3.5 tool_choice=none but model tries to call tool: suppressed
- [ ] 5.3.6 tool_choice=required but model generates text: forced tool call
- [ ] 5.3.7 tool_choice with specific function that doesn't exist in tools list

### 5.4 MCP Integration (`mcp/`)

#### Verify
- [ ] 5.4.1 Client (`client.py`): connects to MCP servers
- [ ] 5.4.2 Executor (`executor.py`): executes tool calls via MCP
- [ ] 5.4.3 Manager (`manager.py`): lifecycle management of MCP connections
- [ ] 5.4.4 Security (`security.py`): input validation, sandboxing
- [ ] 5.4.5 Tools (`tools.py`): tool schema definitions

#### Audit
- [ ] 5.4.6 MCP server crash: client handles disconnection gracefully
- [ ] 5.4.7 Timeout on MCP tool execution: no hanging requests

#### Test
- [ ] 5.4.8 `/v1/mcp/tools`: lists available tools from connected servers
- [ ] 5.4.9 `/v1/mcp/servers`: lists connected MCP servers
- [ ] 5.4.10 `/v1/mcp/execute`: executes tool and returns result
- [ ] 5.4.11 Execute tool with invalid arguments: error message

### 5.5 Built-in Coding Tools (Electron `tools/`)

#### Verify
- [ ] 5.5.1 Tool executor (`executor.ts`): dispatches tool calls
- [ ] 5.5.2 Tool registry (`registry.ts`): registers available tools
- [ ] 5.5.3 Coding tool integration UI (`CodingToolIntegration.tsx`): Claude Code / Codex / OpenCode setup

#### Test
- [ ] 5.5.4 Coding tool integration with Claude Code
- [ ] 5.5.5 Coding tool integration with Codex
- [ ] 5.5.6 InlineToolCall display in chat

---

## 6. API COMPATIBILITY

### 6.1 /v1/chat/completions

#### Verify
- [ ] 6.1.1 Non-streaming: returns complete response
- [ ] 6.1.2 Streaming (SSE): returns chunk-by-chunk with `data:` prefix
- [ ] 6.1.3 Tools: function_call in response when tools invoked
- [ ] 6.1.4 Reasoning: reasoning_content field populated
- [ ] 6.1.5 VLM: image_url content parts processed
- [ ] 6.1.6 Multi-turn: messages array with history
- [ ] 6.1.7 System message: applied as system prompt

#### Audit
- [ ] 6.1.8 Response format: matches OpenAI spec (id, object, created, model, choices, usage)
- [ ] 6.1.9 Usage counting: prompt_tokens + completion_tokens = total_tokens
- [ ] 6.1.10 finish_reason: "stop", "length", "tool_calls" correctly set
- [ ] 6.1.11 n > 1: multiple choices (if supported, or error)

#### Test
- [ ] 6.1.12 Empty messages array: error
- [ ] 6.1.13 Messages with only system: error or empty response
- [ ] 6.1.14 Very large messages array (100+ turns)
- [ ] 6.1.15 Stream=true with tools: tool call chunks formatted correctly
- [ ] 6.1.16 Cancel endpoint: `/v1/chat/completions/{id}/cancel` stops generation

### 6.2 /v1/messages (Anthropic)

#### Verify
- [ ] 6.2.1 Basic message: Anthropic format in → internal format → Anthropic format out
- [ ] 6.2.2 Streaming: SSE with Anthropic event types (message_start, content_block_delta, etc.)
- [ ] 6.2.3 Thinking blocks: `type: "thinking"` in response
- [ ] 6.2.4 tool_use: Anthropic tool format in/out

#### Audit
- [ ] 6.2.5 `AnthropicRequest` → `ChatCompletionRequest` conversion correctness
- [ ] 6.2.6 `AnthropicStreamAdapter`: all event types mapped
- [ ] 6.2.7 System prompt in Anthropic format (top-level `system` field)

#### Test
- [ ] 6.2.8 Claude Code connecting as Anthropic client
- [ ] 6.2.9 Anthropic streaming + stop button
- [ ] 6.2.10 Anthropic tool_use with tool_result follow-up
- [ ] 6.2.11 Max tokens (Anthropic `max_tokens` required field)

### 6.3 /v1/responses

#### Verify
- [ ] 6.3.1 Event types: response.created, response.output_item.added, etc.
- [ ] 6.3.2 Function calls: call_id, name, arguments
- [ ] 6.3.3 Streaming: SSE with Responses API event format

#### Audit
- [ ] 6.3.4 `ResponsesRequest` model: all fields mapped correctly
- [ ] 6.3.5 Event ordering: created → in_progress → output → completed

#### Test
- [ ] 6.3.6 OpenAI Agents SDK connecting via Responses API
- [ ] 6.3.7 Function call response → submit tool output → continue

### 6.4 /v1/completions

#### Verify
- [ ] 6.4.1 Text completion: prompt → generated text
- [ ] 6.4.2 Streaming: SSE chunks
- [ ] 6.4.3 Multi-prompt (if supported)

#### Audit
- [ ] 6.4.4 Model name resolution: `_resolve_model_name()`
- [ ] 6.4.5 Logprobs field (if supported)

#### Test
- [ ] 6.4.6 Empty prompt
- [ ] 6.4.7 Very long prompt (near context limit)
- [ ] 6.4.8 suffix parameter (if supported)

### 6.5 /v1/images/generations

#### Verify
- [ ] 6.5.1 Schnell: text → image generation
- [ ] 6.5.2 Dev: text → image generation
- [ ] 6.5.3 Z-Image-Turbo: text → image generation
- [ ] 6.5.4 Size parameter: various resolutions
- [ ] 6.5.5 Seed parameter: reproducible output

#### Audit
- [ ] 6.5.6 Response format: OpenAI images response (b64_json or url)
- [ ] 6.5.7 Quality parameter mapping to num_steps

#### Test
- [ ] 6.5.8 Invalid size: error handling
- [ ] 6.5.9 Model not loaded: appropriate error
- [ ] 6.5.10 Concurrent image generation requests

### 6.6 /v1/images/edits

#### Verify
- [ ] 6.6.1 Image + instruction → edited image (Qwen Image Edit)
- [ ] 6.6.2 Mask parameter: applies mask correctly
- [ ] 6.6.3 Strength parameter: controls edit intensity
- [ ] 6.6.4 RGBA handling: alpha channel processed correctly

#### Test
- [ ] 6.6.5 Image without mask
- [ ] 6.6.6 Very large image input
- [ ] 6.6.7 Non-square image

### 6.7 /v1/embeddings

#### Verify
- [ ] 6.7.1 Single input: returns embedding vector
- [ ] 6.7.2 Batch input: returns multiple embedding vectors
- [ ] 6.7.3 Model swap: loads embedding model if text model loaded

#### Audit
- [ ] 6.7.4 Embedding dimensions match model specification
- [ ] 6.7.5 Normalization applied correctly

#### Test
- [ ] 6.7.6 Very long input text (beyond model max)
- [ ] 6.7.7 Empty input string
- [ ] 6.7.8 Batch of 100+ inputs

### 6.8 /v1/rerank

#### Verify
- [ ] 6.8.1 Encoder path: bi-encoder reranking
- [ ] 6.8.2 Causal path: causal LM reranking
- [ ] 6.8.3 Late-interaction path (PR #22 Jina v3)

#### Audit
- [ ] 6.8.4 Causal path TokenizerWrapper `__call__` bug (known bug #1 from todo)
- [ ] 6.8.5 JSON parse in /v1/rerank (fixed in session 2026-03-21c)
- [ ] 6.8.6 PR #22 review items: weight shape, doc count assertion, context length guard, zero-norm epsilon

#### Test
- [ ] 6.8.7 Rerank 2 documents
- [ ] 6.8.8 Rerank 100+ documents: context length guard
- [ ] 6.8.9 Empty query or empty documents list
- [ ] 6.8.10 Thread safety in reranker `_load()` (known WARN #12: no mutex)

### 6.9 /v1/audio/*

#### Verify
- [ ] 6.9.1 `/v1/audio/transcriptions`: audio file → text
- [ ] 6.9.2 `/v1/audio/speech`: text → audio (TTS)
- [ ] 6.9.3 `/v1/audio/voices`: list available voices

#### Audit
- [ ] 6.9.4 Audio processor (`audio/processor.py`): format conversion
- [ ] 6.9.5 STT (`audio/stt.py`): model loading, transcription accuracy
- [ ] 6.9.6 TTS (`audio/tts.py`): voice selection, audio quality

#### Test
- [ ] 6.9.7 WAV, MP3, M4A input formats
- [ ] 6.9.8 Very long audio (10+ minutes)
- [ ] 6.9.9 TTS with special characters / multilingual text

### 6.10 Utility Endpoints

#### Verify
- [ ] 6.10.1 `/health`: returns status, model info, memory info
- [ ] 6.10.2 `/v1/models`: returns loaded model name
- [ ] 6.10.3 `/v1/cache/stats`: returns hit rate, size, entries
- [ ] 6.10.4 `/v1/cache/entries`: returns individual cache entries
- [ ] 6.10.5 `/v1/cache/warm`: pre-populates cache with prompt
- [ ] 6.10.6 `DELETE /v1/cache`: clears cache

#### Test
- [ ] 6.10.7 /health during model loading: returns "loading" state
- [ ] 6.10.8 /health after sleep: returns "sleeping" state
- [ ] 6.10.9 /v1/cache/warm with very long prompt

### 6.11 Admin Endpoints

#### Verify
- [ ] 6.11.1 `/admin/soft-sleep`: clears cache, reduces Metal limit
- [ ] 6.11.2 `/admin/deep-sleep`: unloads model
- [ ] 6.11.3 `/admin/wake`: reloads model

#### Test
- [ ] 6.11.4 Wake from soft-sleep: model responds correctly
- [ ] 6.11.5 Wake from deep-sleep: model reloaded and responds
- [ ] 6.11.6 Sleep during active generation: current request handled

### 6.12 Rate Limiting & Auth

#### Verify
- [ ] 6.12.1 API key verification: correct key passes, wrong key rejected
- [ ] 6.12.2 Rate limiting: excessive requests throttled

#### Test
- [ ] 6.12.3 No API key configured: all requests pass
- [ ] 6.12.4 Rate limit burst: rapid requests, verify throttle behavior

---

## 7. ELECTRON APP

### 7.1 Session Lifecycle (IPC `sessions.ts`, main `sessions.ts`)

#### Verify
- [ ] 7.1.1 Create session: DB entry created, settings initialized
- [ ] 7.1.2 Start session: engine process spawned, health check passes
- [ ] 7.1.3 Stop session: engine process killed, port freed
- [ ] 7.1.4 Delete session: DB entry removed, chat history cleared
- [ ] 7.1.5 Sleep session: soft-sleep or deep-sleep via admin endpoint
- [ ] 7.1.6 Wake session: wake via admin endpoint or JIT on request

#### Audit
- [ ] 7.1.7 Zombie process cleanup: orphaned vmlx-engine processes killed
- [ ] 7.1.8 Port allocation: no port conflicts between sessions
- [ ] 7.1.9 DB state sync: session state in DB matches actual process state

#### Test
- [ ] 7.1.10 Create → start → chat → stop → delete: full lifecycle
- [ ] 7.1.11 Start session with already-in-use port
- [ ] 7.1.12 Kill Electron while session running: cleanup on next launch
- [ ] 7.1.13 Multiple sessions running simultaneously
- [ ] 7.1.14 JIT wake: send chat to sleeping session, auto-wakes

### 7.2 Chat Interface

#### Verify
- [ ] 7.2.1 `ChatInterface.tsx`: message input, send, receive display
- [ ] 7.2.2 `MessageBubble.tsx`: user/assistant message rendering
- [ ] 7.2.3 `MessageList.tsx`: scrollable message list with auto-scroll
- [ ] 7.2.4 `InputBox.tsx`: text input, send button, keyboard shortcuts
- [ ] 7.2.5 `ChatList.tsx`: conversation list in sidebar
- [ ] 7.2.6 `ChatSettings.tsx`: per-chat settings (temperature, etc.)
- [ ] 7.2.7 `ReasoningBox.tsx`: collapsible reasoning display
- [ ] 7.2.8 `ToolCallStatus.tsx`: tool call progress/result display
- [ ] 7.2.9 `InlineToolCall.tsx`: inline tool call rendering
- [ ] 7.2.10 `VoiceChat.tsx`: voice input/output

#### Audit
- [ ] 7.2.11 Streaming typewriter: renderer-side implementation (DONE, never touch main process)
- [ ] 7.2.12 Auto-scroll: scrolls during streaming, pauses when user scrolls up
- [ ] 7.2.13 `[THINK]` → `<think>` normalization in `chat.ts`

#### Test
- [ ] 7.2.14 Very long message: rendering performance
- [ ] 7.2.15 Code blocks in response: syntax highlighting
- [ ] 7.2.16 Markdown rendering: tables, lists, links
- [ ] 7.2.17 Rapid send: multiple messages before first response
- [ ] 7.2.18 Empty message send: prevented
- [ ] 7.2.19 Copy message content
- [ ] 7.2.20 Chat history persistence across app restart

### 7.3 Image Tab

#### Verify
- [ ] 7.3.1 `ImageTab.tsx`: main image generation interface
- [ ] 7.3.2 `ImageModelPicker.tsx`: model selection dropdown
- [ ] 7.3.3 `ImagePromptBar.tsx`: prompt input
- [ ] 7.3.4 `ImageGallery.tsx`: generated images display
- [ ] 7.3.5 `ImageHistory.tsx`: past generations
- [ ] 7.3.6 `ImageSettings.tsx`: steps, size, seed, quantization
- [ ] 7.3.7 `ImageTopBar.tsx`: top controls
- [ ] 7.3.8 `MaskPainter.tsx`: mask drawing for image editing
- [ ] 7.3.9 Redo buttons always visible below each image card (not hover-only)

#### Audit
- [ ] 7.3.10 Image session shows only Server Settings (no text inference settings)
- [ ] 7.3.11 ImageSettings quantize dropdown dead after server start (by design)
- [ ] 7.3.12 `imageMode` explicit setting (NO regex for model detection)

#### Test
- [ ] 7.3.13 Select model → auto-start server → enter prompt → generate
- [ ] 7.3.14 Redo button: regenerates with same prompt
- [ ] 7.3.15 Change settings mid-session
- [ ] 7.3.16 Image history persistence

### 7.4 Server Tab

#### Verify
- [ ] 7.4.1 `SessionView.tsx`: server session dashboard
- [ ] 7.4.2 `SessionDashboard.tsx`: overview with status
- [ ] 7.4.3 `SessionSettings.tsx`: model settings
- [ ] 7.4.4 `ServerSettingsDrawer.tsx`: server config panel
- [ ] 7.4.5 `SessionConfigForm.tsx`: configuration form
- [ ] 7.4.6 `LogsPanel.tsx`: server log viewer
- [ ] 7.4.7 `SessionCard.tsx`: session card in list

#### Test
- [ ] 7.4.8 Start server, verify health endpoint accessible
- [ ] 7.4.9 View logs in real-time during generation
- [ ] 7.4.10 Change server settings and restart

### 7.5 Downloads (`DownloadsView.tsx`, `DownloadStatusBar.tsx`, `DownloadTab.tsx`)

#### Verify
- [ ] 7.5.1 HuggingFace model search: results displayed
- [ ] 7.5.2 Model size display: accurate
- [ ] 7.5.3 Download progress: percentage and speed
- [ ] 7.5.4 Pause/resume: download resumes from where it left off
- [ ] 7.5.5 DownloadStatusBar auto-expands (NO silent downloads EVER)

#### Audit
- [ ] 7.5.6 No duplicate downloads for same model
- [ ] 7.5.7 Download cleanup on cancel: partial files removed

#### Test
- [ ] 7.5.8 Download, pause, resume, complete
- [ ] 7.5.9 Download during active inference
- [ ] 7.5.10 Network disconnect during download: retry/resume
- [ ] 7.5.11 Download very large model (50GB+)

### 7.6 Tools Tab

#### Verify
- [ ] 7.6.1 `ToolsDashboard.tsx`: tools overview
- [ ] 7.6.2 `ModelConverter.tsx`: JANG conversion UI
- [ ] 7.6.3 `ModelDoctor.tsx`: model health check
- [ ] 7.6.4 `ModelInspector.tsx`: model architecture viewer
- [ ] 7.6.5 `LogViewer.tsx`: log analysis tool
- [ ] 7.6.6 `useStreamingOperation.ts`: streaming hook for long ops

#### Test
- [ ] 7.6.7 Convert model to JANG format via UI
- [ ] 7.6.8 Run model doctor on loaded model
- [ ] 7.6.9 Inspect model architecture details

### 7.7 Additional Panels

#### Verify
- [ ] 7.7.1 `BenchmarkPanel.tsx`: run benchmarks, display results
- [ ] 7.7.2 `CachePanel.tsx`: cache stats display
- [ ] 7.7.3 `EmbeddingsPanel.tsx`: embedding generation UI
- [ ] 7.7.4 `PerformancePanel.tsx`: performance metrics
- [ ] 7.7.5 `DirectoryManager.tsx`: model directory management

### 7.8 Layout & Navigation

#### Verify
- [ ] 7.8.1 `Sidebar.tsx`: navigation between modes (Chat, Server, Image, Tools, API)
- [ ] 7.8.2 `SidebarHeader.tsx`: branding, version
- [ ] 7.8.3 `TitleBar.tsx`: window controls, flag button, language picker
- [ ] 7.8.4 `ChatHistory.tsx`: conversation history in sidebar
- [ ] 7.8.5 `ChatModeToolbar.tsx`: mode-specific toolbar

#### Test
- [ ] 7.8.6 Switch between all 5 modes: state preserved
- [ ] 7.8.7 Window resize: responsive layout
- [ ] 7.8.8 Dark/light theme toggle (`theme-toggle.tsx`)

### 7.9 API Dashboard

#### Verify
- [ ] 7.9.1 `ApiDashboard.tsx`: API status and documentation
- [ ] 7.9.2 `CodeSnippets.tsx`: copy-paste code examples
- [ ] 7.9.3 `EndpointList.tsx`: all endpoints listed
- [ ] 7.9.4 `CodingToolIntegration.tsx`: IDE integration setup

### 7.10 Other UI

#### Verify
- [ ] 7.10.1 `SetupScreen.tsx`: first-run setup
- [ ] 7.10.2 `UpdateBanner.tsx` / `UpdateNotice.tsx`: update notifications
- [ ] 7.10.3 `Toast.tsx`: notification toasts
- [ ] 7.10.4 `Modal.tsx`: modal dialogs

### 7.11 IPC Channels (14 files)

#### Audit
- [ ] 7.11.1 `chat.ts`: message send/receive, streaming, abort
- [ ] 7.11.2 `sessions.ts`: CRUD, start/stop, sleep/wake
- [ ] 7.11.3 `models.ts`: model list, download, delete
- [ ] 7.11.4 `image.ts`: image generation, editing
- [ ] 7.11.5 `engine.ts`: engine lifecycle
- [ ] 7.11.6 `cache.ts`: cache operations
- [ ] 7.11.7 `audio.ts`: audio recording, playback
- [ ] 7.11.8 `benchmark.ts`: benchmark operations
- [ ] 7.11.9 `embeddings.ts`: embedding operations
- [ ] 7.11.10 `developer.ts`: dev tools, debug info
- [ ] 7.11.11 `export.ts`: chat export
- [ ] 7.11.12 `performance.ts`: perf metrics
- [ ] 7.11.13 `coding-tools.ts`: coding tool integration
- [ ] 7.11.14 `utils.ts`: utility IPC calls
- [ ] 7.11.15 Three-layer IPC integrity: Main → Preload → Renderer (no direct node access in renderer)

### 7.12 Main Process

#### Audit
- [ ] 7.12.1 `index.ts`: app lifecycle, window management
- [ ] 7.12.2 `database.ts`: SQLite WAL mode, schema migrations
- [ ] 7.12.3 `process-manager.ts`: vmlx-engine process spawn/kill
- [ ] 7.12.4 `engine-manager.ts`: engine coordination
- [ ] 7.12.5 `sessions.ts` (main): session state management
- [ ] 7.12.6 `server.ts` (main): local server for renderer
- [ ] 7.12.7 `tray.ts`: system tray icon, menu, status (listens to BOTH ProcessManager AND SessionManager)
- [ ] 7.12.8 `memory-enforcer.ts`: Metal memory monitoring and enforcement
- [ ] 7.12.9 `model-config-registry.ts`: Electron-side model config
- [ ] 7.12.10 `update-checker.ts`: auto-update check against latest.json
- [ ] 7.12.11 `db/model-settings.ts`: per-model settings persistence

### 7.13 i18n

#### Audit
- [ ] 7.13.1 Only ~5% of UI uses translations (TitleBar + About page)
- [ ] 7.13.2 ~300+ hardcoded strings across 50+ components
- [ ] 7.13.3 5 languages with 176 keys each
- [ ] 7.13.4 Dead i18n file: `panel/src/renderer/src/i18n/index.tsx` (known bug #4 from todo)
- [ ] 7.13.5 Many keys exist but aren't wired (`convert.*`, `tools.*`)

---

## 8. MODEL-SPECIFIC COMPATIBILITY

### 8.1 Mistral 4

- [ ] 8.1.1 MLA: kv_b_proj split, head inflation, no KV quant
- [ ] 8.1.2 MoE: expert routing, gate dequant
- [ ] 8.1.3 VLM: image_token_index=10 [IMG], vision encoder, _Mistral4VLMBackbone
- [ ] 8.1.4 Reasoning: [THINK]/[/THINK], reasoning_effort "none"/"high"
- [ ] 8.1.5 Tool calling: mistral tool parser
- [ ] 8.1.6 think_in_template=False: multi-turn with reasoning
- [ ] 8.1.7 JANG 2L/4M quantization targets
- [ ] 8.1.8 2-bit quantized vision encoder quality (known limitation)
- [ ] 8.1.9 Prefix cache gen_prompt_len for Mistral reasoning

### 8.2 Nemotron-H (Hybrid SSM)

- [ ] 8.2.1 MambaCache layers + attention layers coexistence
- [ ] 8.2.2 Boundary snapshots for MambaCache state
- [ ] 8.2.3 Chunked prefill: broadcast fix (root cause from session 2026-03-21)
- [ ] 8.2.4 MambaCache merge in continuous batching
- [ ] 8.2.5 CacheList for MoE layers within hybrid SSM
- [ ] 8.2.6 QuantizedKVCache list/tuple reconstruction for 40+8 layers

### 8.3 Nemotron Cascade

- [ ] 8.3.1 MoE: expert routing
- [ ] 8.3.2 Gate dequant: 8-bit high-to-low
- [ ] 8.3.3 fc1/fc2 rename
- [ ] 8.3.4 Confirmed: 42GB / 46 tok/s

### 8.4 DeepSeek V3

- [ ] 8.4.1 MLA: absorbed attention, latent KV
- [ ] 8.4.2 MoE: shared expert + routed experts
- [ ] 8.4.3 CacheList: per-expert cache management
- [ ] 8.4.4 bfloat16 computation

### 8.5 Qwen3 / Qwen3-VL

- [ ] 8.5.1 Thinking: `<think>` tags, enable_thinking toggle
- [ ] 8.5.2 Tool calling: qwen tool parser
- [ ] 8.5.3 VLM: vision_config, image processing
- [ ] 8.5.4 Multi-turn with thinking on/off

### 8.6 MiniMax

- [ ] 8.6.1 Always-thinks template: think_in_template detection
- [ ] 8.6.2 No thinking toggle (always produces thinking)

### 8.7 Kimi K2

- [ ] 8.7.1 MoE: expert routing
- [ ] 8.7.2 Thinking support
- [ ] 8.7.3 Tool calling: kimi tool parser

### 8.8 Llama

- [ ] 8.8.1 Standard attention: GQA
- [ ] 8.8.2 Tool calling: llama tool parser
- [ ] 8.8.3 All quantization levels (JANG + standard)

### 8.9 Gemma

- [ ] 8.9.1 Standard attention
- [ ] 8.9.2 Sliding window (if applicable)

### 8.10 GLM-Z1

- [ ] 8.10.1 Harmony protocol
- [ ] 8.10.2 GLM-47 tool parser

---

## 9. IMAGE GENERATION

### 9.1 mflux Models (`image_gen.py`)

#### Verify
- [ ] 9.1.1 Schnell (`Flux1`): dual encoder, local loading
- [ ] 9.1.2 Dev (`Flux1`): dual encoder, local loading
- [ ] 9.1.3 Z-Image-Turbo (`ZImage`): single encoder, local loading
- [ ] 9.1.4 Klein: REMOVED (mflux single-encoder limitation)

#### Audit
- [ ] 9.1.5 mflux 0.16.9 quantized model loading broken (known issue -- MLX version conflict)
- [ ] 9.1.6 Single vs dual encoder: correct class used per model

#### Test
- [ ] 9.1.7 Generate at 512x512, 1024x1024, custom sizes
- [ ] 9.1.8 Same seed produces same image
- [ ] 9.1.9 num_steps parameter: fewer steps = faster but lower quality

### 9.2 Image Editing (Qwen Image Edit)

#### Verify
- [ ] 9.2.1 Instruction-based editing: image + text → edited image
- [ ] 9.2.2 Full precision only (~54GB requirement)

#### Test
- [ ] 9.2.3 Simple edit: "make the sky red"
- [ ] 9.2.4 Complex edit: object removal
- [ ] 9.2.5 Edit with mask via MaskPainter

### 9.3 Model Detection

#### Verify
- [ ] 9.3.1 `model_index.json` detection for diffusion models
- [ ] 9.3.2 Single encoder vs dual encoder detection
- [ ] 9.3.3 transformer + text_encoder layout
- [ ] 9.3.4 transformer + vae layout

### 9.4 Image Server Integration

#### Verify
- [ ] 9.4.1 Image session in Server tab: only shows Server Settings
- [ ] 9.4.2 `/v1/images/generations` endpoint works with server session
- [ ] 9.4.3 `/v1/images/edits` endpoint works with server session

---

## 10. POWER MANAGEMENT

### 10.1 Soft Sleep

#### Verify
- [ ] 10.1.1 Cache cleared on soft sleep
- [ ] 10.1.2 Metal memory limit reduced
- [ ] 10.1.3 Model stays loaded (weights in memory)
- [ ] 10.1.4 Server process stays alive

#### Test
- [ ] 10.1.5 Soft sleep → chat request: auto-wake
- [ ] 10.1.6 Soft sleep → explicit wake → chat

### 10.2 Deep Sleep

#### Verify
- [ ] 10.2.1 Model fully unloaded from GPU memory
- [ ] 10.2.2 Server process stays alive (listening for wake)
- [ ] 10.2.3 Memory reclaimed (Metal memory drops)

#### Test
- [ ] 10.2.4 Deep sleep → JIT wake → chat
- [ ] 10.2.5 Deep sleep → app restart → session state persisted

### 10.3 JIT Wake

#### Verify
- [ ] 10.3.1 Chat request to sleeping session triggers auto-load
- [ ] 10.3.2 API request to sleeping session triggers auto-load
- [ ] 10.3.3 Wake completes before response generation starts

#### Audit
- [ ] 10.3.4 JIT deep wake: model reloaded correctly (from session 2026-03-20d)
- [ ] 10.3.5 Multiple JIT wakes: no double-load race condition
- [ ] 10.3.6 Multiple sessions with JIT: no cross-contamination

#### Test
- [ ] 10.3.7 JIT wake while another session is active
- [ ] 10.3.8 JIT wake with very large model (slow load)
- [ ] 10.3.9 JIT wake timeout: request doesn't hang forever

### 10.4 Idle Timer

#### Verify
- [ ] 10.4.1 Per-session idle timer: triggers sleep after configured duration
- [ ] 10.4.2 Global idle timer: triggers sleep for all sessions
- [ ] 10.4.3 Timer reset on activity (chat message, API request)

#### Audit
- [ ] 10.4.4 Timer fires during active generation: should NOT sleep
- [ ] 10.4.5 Timer accuracy: fires within reasonable window of target time

#### Test
- [ ] 10.4.6 Set 1-minute idle timer, wait, verify sleep triggered
- [ ] 10.4.7 Set idle timer, send request just before expiry: timer resets

### 10.5 State Tracking

#### Verify
- [ ] 10.5.1 DB state matches actual process state (running, sleeping, stopped)
- [ ] 10.5.2 Server health endpoint reflects sleep state
- [ ] 10.5.3 UI shows correct status icon/text

#### Audit
- [ ] 10.5.4 State transitions: running ↔ soft-sleep ↔ deep-sleep (no invalid)
- [ ] 10.5.5 Crash during sleep transition: state recoverable

---

## 11. ADDITIONAL SUBSYSTEMS

### 11.1 Attention (`attention.py`)

- [ ] 11.1.1 Standard multi-head attention
- [ ] 11.1.2 Grouped-query attention (GQA)
- [ ] 11.1.3 Multi-latent attention (MLA)
- [ ] 11.1.4 Sliding window attention

### 11.2 Embedding (`embedding.py`)

- [ ] 11.2.1 Encoder model loading
- [ ] 11.2.2 Batch embedding computation
- [ ] 11.2.3 Dimension normalization

### 11.3 Multimodal Processor (`multimodal_processor.py`)

- [ ] 11.3.1 Image preprocessing: resize, normalize
- [ ] 11.3.2 Multi-image handling
- [ ] 11.3.3 Vision embedding cache (`vision_embedding_cache.py`)

### 11.4 Model Runner (`model_runner.py`)

- [ ] 11.4.1 Forward pass orchestration
- [ ] 11.4.2 Cache management integration

### 11.5 Output Collector (`output_collector.py`)

- [ ] 11.5.1 Token collection and formatting
- [ ] 11.5.2 Usage statistics computation

### 11.6 Worker (`worker.py`)

- [ ] 11.6.1 Background task execution
- [ ] 11.6.2 Thread safety

### 11.7 Optimizations (`optimizations.py`)

- [ ] 11.7.1 Metal kernel optimizations
- [ ] 11.7.2 Memory optimization strategies

### 11.8 Plugin System (`plugin.py`)

- [ ] 11.8.1 Plugin loading and registration
- [ ] 11.8.2 Plugin lifecycle management

### 11.9 CLI (`cli.py`)

- [ ] 11.9.1 `vmlx` command: main entry point
- [ ] 11.9.2 `vmlx-serve`: server mode
- [ ] 11.9.3 `vmlx-engine`: engine mode
- [ ] 11.9.4 CLI commands: convert, doctor, info, list

### 11.10 API Streaming (`api/streaming.py`)

- [ ] 11.10.1 SSE format: `data: {...}\n\n`
- [ ] 11.10.2 `[DONE]` sentinel
- [ ] 11.10.3 Heartbeat/keepalive for long generations

### 11.11 API Tool Calling (`api/tool_calling.py`)

- [ ] 11.11.1 Tool call extraction from model output
- [ ] 11.11.2 Tool call formatting in response

### 11.12 API Utils (`api/utils.py`)

- [ ] 11.12.1 Model name resolution
- [ ] 11.12.2 Request validation

### 11.13 Chat Templates (`utils/chat_templates.py`)

- [ ] 11.13.1 Jinja2 template application
- [ ] 11.13.2 System prompt injection
- [ ] 11.13.3 Multi-turn formatting

### 11.14 Tokenizer Utils (`utils/tokenizer.py`)

- [ ] 11.14.1 Tokenizer loading
- [ ] 11.14.2 TokenizerWrapper: encode/decode

### 11.15 Gradio Apps (`gradio_app.py`, `gradio_text_app.py`)

- [ ] 11.15.1 Web UI for standalone usage
- [ ] 11.15.2 Text-only mode

### 11.16 Benchmark (`benchmark.py`)

- [ ] 11.16.1 Throughput measurement: tokens/sec
- [ ] 11.16.2 Latency measurement: time-to-first-token
- [ ] 11.16.3 Memory measurement: peak GPU usage

### 11.17 MLX Platform (`mlx_platform.py`)

- [ ] 11.17.1 Metal device detection
- [ ] 11.17.2 Memory limit queries
- [ ] 11.17.3 connectHost() 0.0.0.0 → 127.0.0.1 conversion

### 11.18 Request Model (`request.py`)

- [ ] 11.18.1 All request fields validated
- [ ] 11.18.2 Default values correct

### 11.19 Model Registry (`model_registry.py`)

- [ ] 11.19.1 Recommended models list
- [ ] 11.19.2 Model family classification

---

## 12. BUILD & RELEASE

### 12.1 Build

- [ ] 12.1.1 Source → bundled sync: `cp -R vmlx_engine/* panel/bundled-python/...`
- [ ] 12.1.2 `npm run build`: no TypeScript errors
- [ ] 12.1.3 `npx electron-builder --mac --dir`: produces .app
- [ ] 12.1.4 App launches from /Applications

### 12.2 Release

- [ ] 12.2.1 DMG build with notarization: `source .env.signing && npx electron-builder --mac dmg`
- [ ] 12.2.2 Apple notarization passes (Gatekeeper won't block)
- [ ] 12.2.3 DMG uploaded to GitHub release (mlxstudio repo)
- [ ] 12.2.4 latest.json updated on mlxstudio repo (auto-updater)
- [ ] 12.2.5 PyPI package: `pip install vmlx` installs correctly
- [ ] 12.2.6 Version bumped in all locations

### 12.3 Testing

- [ ] 12.3.1 Python tests: `.venv/bin/pytest tests/ -k "not Async" -v` (2000+ tests)
- [ ] 12.3.2 Panel tests: `cd panel && npx vitest run` (1545+ tests)
- [ ] 12.3.3 All tests pass before release

---

## 13. SECURITY

### 13.1 API Security

- [ ] 13.1.1 API key not logged in plaintext
- [ ] 13.1.2 Rate limiting prevents abuse
- [ ] 13.1.3 Input validation on all endpoints (no injection)

### 13.2 MCP Security

- [ ] 13.2.1 Tool execution sandboxed (`mcp/security.py`)
- [ ] 13.2.2 No arbitrary code execution without user consent

### 13.3 Electron Security

- [ ] 13.3.1 No `nodeIntegration: true` in renderer
- [ ] 13.3.2 Context isolation enabled
- [ ] 13.3.3 Preload script exposes only safe APIs

### 13.4 Sensitive Data

- [ ] 13.4.1 No credentials in source code (`.env.signing` gitignored)
- [ ] 13.4.2 No personal data in repository
- [ ] 13.4.3 API keys not stored in plaintext in DB

---

## 14. KNOWN BUGS (from todo-next-session.md)

### 14.1 Must Fix

- [ ] 14.1.1 Reranker causal path TokenizerWrapper `__call__` bug (line 187 in `_score_causal()`)
- [ ] 14.1.2 MLLM scheduler `_extract_cache_states` missing GQA head normalization
- [ ] 14.1.3 block_disk_store `_serialize_block` CacheList tag not handled
- [ ] 14.1.4 Dead i18n file `panel/src/renderer/src/i18n/index.tsx`

### 14.2 Known Limitations (not fixable)

- [ ] 14.2.1 SimpleEngine prefill not interruptible
- [ ] 14.2.2 mflux 0.16.9 quantized model loading broken (MLX version conflict)
- [ ] 14.2.3 JANG VL MoE not working (sanitizer conflict)
- [ ] 14.2.4 2-bit quantized vision encoders produce poor quality
- [ ] 14.2.5 macOS 15+ required for Metal language v4

### 14.3 12 WARNs (all low-impact)

- [ ] 14.3.1 bfloat16 for all MLA models
- [ ] 14.3.2 numpy block_slice skips CacheList
- [ ] 14.3.3 `_ensure_batch_cache` checks ArraysCache not MambaCache
- [ ] 14.3.4 Reasoning ON but no think tags → fallback re-emit delay
- [ ] 14.3.5 q4 KV quant degrades long reasoning context on restore
- [ ] 14.3.6 Partial think tags across chunks → rare char leak
- [ ] 14.3.7 GPT-OSS emitted_reasoning shrink edge case
- [ ] 14.3.8 Stale `_n_kv_heads` on model switch (FIXED)
- [ ] 14.3.9 CacheList numpy path always "skip"
- [ ] 14.3.10 MLA MLLM batch with head inflation
- [ ] 14.3.11 `_resolve_model_path` dead code in PR #22
- [ ] 14.3.12 Thread safety in reranker `_load()` (no mutex)

---

## CROSS-CUTTING CONCERNS

### C.1 Sleep/Wake Matrix
Test every subsystem after sleep/wake:
- [ ] C.1.1 Prefix cache after soft sleep/wake
- [ ] C.1.2 KV cache quantization after sleep/wake
- [ ] C.1.3 Continuous batching after sleep/wake
- [ ] C.1.4 Paged cache after sleep/wake
- [ ] C.1.5 Block disk store after sleep/wake
- [ ] C.1.6 Tool parsers after sleep/wake (stateless? or stale state?)
- [ ] C.1.7 Reasoning parsers after sleep/wake

### C.2 Model Switch Matrix
Test every subsystem when switching models:
- [ ] C.2.1 Standard → MLA: cache fully cleared, head config updated
- [ ] C.2.2 MLA → Hybrid SSM: MambaCache layers initialized
- [ ] C.2.3 Text → VLM: vision encoder loaded
- [ ] C.2.4 VLM → Text: vision encoder unloaded, no memory leak

### C.3 Error Recovery
- [ ] C.3.1 Engine crash during generation: error reported to UI, session restartable
- [ ] C.3.2 Network error during download: retry with resume
- [ ] C.3.3 Corrupt model files: meaningful error message
- [ ] C.3.4 Metal kernel panic: numpy round-trip fix applied (issues #5, #7, #11)
- [ ] C.3.5 OOM during model load: graceful failure, no zombie process

### C.4 Concurrency
- [ ] C.4.1 Two chat sessions to same model: independent outputs
- [ ] C.4.2 Chat + image generation simultaneously
- [ ] C.4.3 Download + inference simultaneously
- [ ] C.4.4 Sleep one session while another is active
- [ ] C.4.5 JIT wake race: two requests arrive for sleeping session
