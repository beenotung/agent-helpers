# Reasoning field name on replay

Fixed in `488586d`. See [docs/reasoning-recall.md](../../docs/reasoning-recall.md)
for the provider behaviour and the method used to measure it.

## Cause

There is no standard field name for the reasoning trace. `reasoning_content` is
used by LM Studio / opencode zen / DeepSeek, `reasoning` by Ollama Cloud.

The client only knew `reasoning_content`, which broke both directions:

- **read**: an Ollama response had no `reasoning_content`, so its chain was
  silently dropped and the callbacks never fired
- **write**: `toMessage()` always rewrote to `reasoning_content`. A model reads
  back only the key it wrote itself, so Ollama reasoning was lost on replay

## Fix

- `getReasoning(message)` / `getReasoningField(message)` read either name
- `StreamResponse.reasoning_field` records which key the deltas arrived under
- `toMessage()` echoes that same key instead of rewriting it
- `complete()` returns the provider response untouched instead of adding a second
  field, so there is one copy of the reasoning, not two

Verified live: ollama-cloud echoes `reasoning`, zen echoes `reasoning_content`.

## Notes

- Recall on replay is unreliable (~50% when it works) and per-model, so treat
  cross-turn reasoning continuity as best-effort.
- Poe returns the same text under **both** keys. `getReasoning` returns the first,
  so nothing is duplicated.
- `reasoning_text` is Responses-API-only and never appears over chat completions.
